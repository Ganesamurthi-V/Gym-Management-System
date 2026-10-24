import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlertInput, AlertSeverity } from '@/lib/monitoring/alert'
import { getCronLastOk, type CronName } from '@/lib/monitoring/cronStatus'

/**
 * Business-logic watchdog: cheap checks run every 5 minutes by an external scheduler.
 * Everything is injected (supabase, redis, reportAlert, clock) so the checks are unit tested
 * without a database. The alert helper de-duplicates, so re-raising each run is intended.
 */

// ── Thresholds (why-comments) ─────────────────────────────────────────────────────────────
/** The drain runs every 5 min; a pending row 30 min past its time means the drain is not running. */
export const QUEUE_BACKLOG_MS = 30 * 60_000
/** Claim lease is 10 min (lib/whatsapp/queue.ts); 15 min means the reaper itself did not run. */
export const STUCK_SENDING_MS = 15 * 60_000
/** A handful of failures is normal (bad numbers); 10 in a day signals a template or token problem. */
export const FAILED_24H_THRESHOLD = 10
/** Meta caps unique recipients at 250 per rolling 24 h; warn with room to act. */
export const RECIPIENT_WINDOW_WARN = 220
/** Daily crons get 26 h: 24 h plus grace for a late start. */
export const CRON_STALE_MS = 26 * 60 * 60_000
/** Subscription cron should flip expired gyms the same night; 1 day late means it missed. */
export const SUB_CRON_GRACE_MS = 24 * 60 * 60_000
/** Owners who uploaded payment proof should be answered within a day. */
export const SUB_REQUEST_WAIT_MS = 24 * 60 * 60_000
/** Unprocessed webhook rows in the last hour: a few are retries, 5+ means the handler is failing. */
export const WEBHOOK_UNPROCESSED_THRESHOLD = 5
/** QStash free tier allows 1000 publishes a day; warn at 800. */
export const QSTASH_BUDGET_WARN = 800
/** A trivial query slower than this means the database is struggling. */
export const DB_SLOW_MS = 2000
/** Per-check budget so one hung query cannot stall the 10 s route. */
export const CHECK_TIMEOUT_MS = 3000
/**
 * Precise token-failure phrases only. A bare '401' matched phone numbers and ids inside error text
 * and raised false CRITICALs, so the status code must appear as 'http 401'.
 */
export const TOKEN_ERROR_PATTERNS = ['http 401', 'error 190', 'oauth', 'access token']
export const TOKEN_ERROR_FILTER = TOKEN_ERROR_PATTERNS.map((p) => `last_error.ilike.%${p}%`).join(',')
/** Short window: once the owner renews the token the alert must stop within hours, not a day. */
export const TOKEN_ERROR_WINDOW_MS = 2 * 3600_000

export type CheckResult =
  | { name: string; ok: true; detail?: string }
  | { name: string; ok: false; severity: AlertSeverity; key: string; title: string; body: string }

export interface WatchdogRedis {
  ping(): Promise<unknown>
  get(key: string): Promise<unknown>
}

export interface WatchdogDeps {
  supabase: SupabaseClient
  /** null when Redis is not configured. */
  redis: WatchdogRedis | null
  reportAlert: (input: AlertInput) => Promise<void>
  now: () => Date
  /** Live Graph probe (checkWhatsAppMeta from checks.ts); omitted in tests. */
  metaCheck?: () => Promise<{ ok: boolean; detail?: string }>
  cronLastOk?: (name: CronName) => Promise<Date | null>
  timeoutMs?: number
}

type Check = (d: WatchdogDeps) => Promise<CheckResult>

const fail = (name: string, severity: AlertSeverity, key: string, title: string, body: string): CheckResult =>
  ({ name, ok: false, severity, key, title, body })
const pass = (name: string, detail?: string): CheckResult => ({ name, ok: true, ...(detail ? { detail } : {}) })
const ago = (d: WatchdogDeps, ms: number) => new Date(d.now().getTime() - ms).toISOString()

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: c, error } = await q
  if (error) throw new Error(error.message)
  return c ?? 0
}

const head = { count: 'exact' as const, head: true }

const queueBacklog: Check = async (d) => {
  const n = await count(
    d.supabase.from('whatsapp_send_queue').select('id', head)
      .eq('status', 'pending').lt('scheduled_at', ago(d, QUEUE_BACKLOG_MS)),
  )
  return n === 0 ? pass('queue_backlog')
    : fail('queue_backlog', 'warning', 'wa:queue_backlog', 'WhatsApp queue backlog',
        `${n} message(s) pending for over 30 min. The QStash drain may not be running.`)
}

const queueStuckSending: Check = async (d) => {
  const n = await count(
    d.supabase.from('whatsapp_send_queue').select('id', head)
      .eq('status', 'sending').lt('locked_at', ago(d, STUCK_SENDING_MS)),
  )
  return n === 0 ? pass('queue_stuck_sending')
    : fail('queue_stuck_sending', 'critical', 'wa:queue_stuck_sending', 'WhatsApp queue stuck sending',
        `${n} message(s) in 'sending' for over 15 min (lease is 10 min). The lease reaper is not running.`)
}

const queueFailedHigh: Check = async (d) => {
  const n = await count(
    d.supabase.from('whatsapp_send_queue').select('id', head)
      .in('status', ['failed', 'delivery_failed']).gte('created_at', ago(d, 24 * 3600_000)),
  )
  return n < FAILED_24H_THRESHOLD ? pass('queue_failed_high')
    : fail('queue_failed_high', 'warning', 'wa:queue_failed_high', 'Many WhatsApp sends failed',
        `${n} queue message(s) failed in the last 24 h (threshold ${FAILED_24H_THRESHOLD}).`)
}

const tokenExpired: Check = async (d) => {
  const { data, error } = await d.supabase.from('whatsapp_send_queue').select('created_at')
    .gte('created_at', ago(d, TOKEN_ERROR_WINDOW_MS)).or(TOKEN_ERROR_FILTER)
    .order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  const lastErr = (data as Array<{ created_at: string }> | null)?.[0]?.created_at
  if (lastErr) {
    // A send that succeeded after the newest token error means the token works again.
    const recovered = await count(
      d.supabase.from('whatsapp_send_queue').select('id', head).eq('status', 'sent').gt('sent_at', lastErr),
    )
    if (recovered === 0) {
      return fail('token_expired', 'critical', 'wa:token_expired', 'WhatsApp access token looks invalid',
        'A queue message in the last 2 h failed with an auth-type error and no send has succeeded since. Rotate WHATSAPP_ACCESS_TOKEN.')
    }
  }
  if (d.metaCheck) {
    const live = await d.metaCheck()
    if (!live.ok && (live.detail === 'http_401' || live.detail === 'http_403' || live.detail === 'http_400')) {
      return fail('token_expired', 'critical', 'wa:token_expired', 'WhatsApp access token rejected by Meta',
        `Live Graph check answered ${live.detail}. Rotate WHATSAPP_ACCESS_TOKEN.`)
    }
  }
  return pass('token_expired')
}

const recipientWindowHigh: Check = async (d) => {
  const n = await count(
    d.supabase.from('whatsapp_recipient_window').select('phone_e164', head)
      .gt('first_sent_at', ago(d, 24 * 3600_000)),
  )
  return n < RECIPIENT_WINDOW_WARN ? pass('recipient_window_high', `${n}/250`)
    : fail('recipient_window_high', 'warning', 'wa:recipient_window_high', 'WhatsApp recipient window nearly full',
        `${n} of 250 unique recipients used in the rolling 24 h.`)
}

function cronStale(cron: CronName): Check {
  const name = `cron_${cron}_stale`
  return async (d) => {
    const last = await (d.cronLastOk ?? getCronLastOk)(cron)
    if (!last) return pass(name, 'unknown (no cron success recorded yet)')
    const age = d.now().getTime() - last.getTime()
    return age <= CRON_STALE_MS ? pass(name)
      : fail(name, 'critical', `cron:${cron}:stale`, `${cron} cron has not succeeded`,
          `Last success ${Math.round(age / 3600_000)} h ago (limit 26 h).`)
  }
}

export const subCronOrFilter = (cutoff: string) =>
  `and(subscription_status.eq.trial,trial_ends_at.lt.${cutoff}),and(subscription_status.eq.active,subscription_ends_at.lt.${cutoff})`

const subCronMissed: Check = async (d) => {
  const cutoff = ago(d, SUB_CRON_GRACE_MS)
  const { data, count: c, error } = await d.supabase.from('gyms').select('id', { count: 'exact' })
    .or(subCronOrFilter(cutoff))
    .limit(5)
  if (error) throw new Error(error.message)
  const n = c ?? data?.length ?? 0
  if (n === 0) return pass('sub_cron_missed')
  const ids = (data ?? []).map((r: { id: string }) => r.id).join(', ')
  return fail('sub_cron_missed', 'critical', 'sub:cron_missed', 'Subscription cron missed gyms',
    `${n} gym(s) are past their end date by over a day but not expired. Example ids: ${ids}.`)
}

const subRequestsWaiting: Check = async (d) => {
  const n = await count(
    d.supabase.from('subscription_requests').select('id', head)
      .eq('status', 'pending').lt('submitted_at', ago(d, SUB_REQUEST_WAIT_MS)),
  )
  return n === 0 ? pass('sub_requests_waiting')
    : fail('sub_requests_waiting', 'warning', 'sub:requests_waiting', 'Payment proofs waiting for review',
        `${n} subscription request(s) pending for over 24 h.`)
}

const webhookUnprocessed: Check = async (d) => {
  const n = await count(
    d.supabase.from('whatsapp_webhook_logs').select('id', head)
      .eq('processed', false).gte('created_at', ago(d, 3600_000)),
  )
  return n < WEBHOOK_UNPROCESSED_THRESHOLD ? pass('webhook_unprocessed')
    : fail('webhook_unprocessed', 'warning', 'wa:webhook_unprocessed', 'WhatsApp webhooks not being processed',
        `${n} webhook event(s) unprocessed in the last hour.`)
}

const qstashBudget: Check = async (d) => {
  if (!d.redis) return pass('qstash_budget', 'redis not configured')
  const day = d.now().toISOString().slice(0, 10).replace(/-/g, '')
  const n = Number((await d.redis.get(`qstash:publishes:${day}`)) ?? 0)
  return !(n >= QSTASH_BUDGET_WARN) ? pass('qstash_budget', `${Number.isFinite(n) ? n : 0}`)
    : fail('qstash_budget', 'warning', 'qstash:budget', 'QStash daily publishes high',
        `${n} publishes today (free limit 1000).`)
}

const redisDown: Check = async (d) => {
  if (!d.redis) return pass('redis_down', 'not configured')
  try {
    await d.redis.ping()
    return pass('redis_down')
  } catch {
    return fail('redis_down', 'critical', 'redis:down', 'Redis is down',
      'Upstash PING failed. Rate limiting and caching are degraded.')
  }
}

const dbSlow: Check = async (d) => {
  const t0 = Date.now()
  const { error } = await d.supabase.from('gyms').select('id', head).limit(1)
  if (error) throw new Error(error.message)
  const ms = Date.now() - t0
  return ms <= DB_SLOW_MS ? pass('db_slow', `${ms}ms`)
    : fail('db_slow', 'warning', 'db:slow', 'Database is slow', `A trivial query took ${ms} ms (limit ${DB_SLOW_MS}).`)
}

/** Every table and column the checks query; the schema-conformance test reads this. */
export const WATCHDOG_QUERY_TARGETS: Array<{ table: string; columns: string[] }> = [
  { table: 'whatsapp_send_queue', columns: ['id', 'status', 'scheduled_at', 'locked_at', 'created_at', 'sent_at', 'last_error'] },
  { table: 'whatsapp_recipient_window', columns: ['phone_e164', 'first_sent_at'] },
  { table: 'gyms', columns: ['id', 'subscription_status', 'trial_ends_at', 'subscription_ends_at'] },
  { table: 'subscription_requests', columns: ['id', 'status', 'submitted_at'] },
  { table: 'whatsapp_webhook_logs', columns: ['id', 'processed', 'created_at'] },
]

export const CHECKS: Record<string, Check> = {
  queue_backlog: queueBacklog,
  queue_stuck_sending: queueStuckSending,
  queue_failed_high: queueFailedHigh,
  token_expired: tokenExpired,
  recipient_window_high: recipientWindowHigh,
  cron_whatsapp_stale: cronStale('whatsapp'),
  cron_subscription_stale: cronStale('subscription'),
  sub_cron_missed: subCronMissed,
  sub_requests_waiting: subRequestsWaiting,
  webhook_unprocessed: webhookUnprocessed,
  qstash_budget: qstashBudget,
  redis_down: redisDown,
  db_slow: dbSlow,
}

export const CHECK_NAMES = Object.keys(CHECKS)

export interface WatchdogSummary {
  status: 'ok' | 'alerting'
  checks: Record<string, { ok: boolean; detail?: string }>
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const t = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms) })
  return Promise.race([p, t]).finally(() => clearTimeout(timer))
}

async function runOne(name: string, d: WatchdogDeps): Promise<CheckResult> {
  try {
    return await withTimeout(CHECKS[name](d), d.timeoutMs ?? CHECK_TIMEOUT_MS)
  } catch (err) {
    // The error message is for the alert body only; it never reaches the HTTP response.
    const msg = err instanceof Error ? err.message : 'unknown error'
    return fail(name, 'warning', `watchdog:check_error:${name}`, `Watchdog check failed to run: ${name}`, msg)
  }
}

/** Run every check in parallel, raise an alert for each failure, return a JSON-friendly summary. */
export async function runWatchdog(d: WatchdogDeps): Promise<WatchdogSummary> {
  const results = await Promise.all(CHECK_NAMES.map((n) => runOne(n, d)))
  await Promise.all(
    results.map(async (r) => {
      if (r.ok) return
      try {
        await d.reportAlert({ key: r.key, severity: r.severity, title: r.title, body: r.body })
      } catch {
        // reportAlert should never throw; a monitor must not fail because of its own alerting.
      }
    }),
  )
  const checks: WatchdogSummary['checks'] = {}
  for (const r of results) {
    checks[r.name] = r.ok ? { ok: true, ...(r.detail ? { detail: r.detail } : {}) } : { ok: false, detail: r.key }
  }
  return { status: results.every((r) => r.ok) ? 'ok' : 'alerting', checks }
}

const SIMULATED: Record<string, { severity: AlertSeverity; title: string }> = {
  queue_backlog: { severity: 'warning', title: 'WhatsApp queue backlog' },
  queue_stuck_sending: { severity: 'critical', title: 'WhatsApp queue stuck sending' },
  queue_failed_high: { severity: 'warning', title: 'Many WhatsApp sends failed' },
  token_expired: { severity: 'critical', title: 'WhatsApp access token looks invalid' },
  recipient_window_high: { severity: 'warning', title: 'WhatsApp recipient window nearly full' },
  cron_whatsapp_stale: { severity: 'critical', title: 'whatsapp cron has not succeeded' },
  cron_subscription_stale: { severity: 'critical', title: 'subscription cron has not succeeded' },
  sub_cron_missed: { severity: 'critical', title: 'Subscription cron missed gyms' },
  sub_requests_waiting: { severity: 'warning', title: 'Payment proofs waiting for review' },
  webhook_unprocessed: { severity: 'warning', title: 'WhatsApp webhooks not being processed' },
  qstash_budget: { severity: 'warning', title: 'QStash daily publishes high' },
  redis_down: { severity: 'critical', title: 'Redis is down' },
  db_slow: { severity: 'warning', title: 'Database is slow' },
}

/**
 * Drill: raise one check's alert without reading or writing any data. Uses a `drill:` key so the
 * drill neither blocks nor is blocked by the real alert's de-duplication window.
 */
export async function simulateCheck(name: string, d: Pick<WatchdogDeps, 'reportAlert'>): Promise<boolean> {
  const s = SIMULATED[name]
  if (!s) return false
  await d.reportAlert({
    key: `drill:${name}`,
    severity: s.severity,
    title: `[DRILL] ${s.title}`,
    body: `Simulated alert for check "${name}". Nothing is actually wrong.`,
  })
  return true
}
