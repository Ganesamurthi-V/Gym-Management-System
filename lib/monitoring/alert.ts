import { after } from 'next/server'
import { logger } from '@/lib/logger'
import { getAlertGuide } from '@/lib/monitoring/alertGuides'

/**
 * Failure alerting: Telegram (independent of Vercel/Supabase) + admin app history/push
 * (a `notifications` row of type 'alert'). Callers use reportAlert / reportAlertInBackground.
 * Never throws; every stage has its own timeout so a hung dependency cannot stall a request.
 */

export type AlertSeverity = 'critical' | 'warning'
export interface AlertInput {
  /** Stable dedupe key, e.g. '5xx:/api/members', 'wa:queue:failed'. Same key inside the cooldown = one alert. */
  key: string
  severity: AlertSeverity
  title: string // short, no secrets
  body: string // details; route name, gym id, counts; NEVER secrets, tokens, request bodies, phone numbers
  gymId?: string | null
  /** Override cooldown; default critical 1800 s, warning 21600 s. */
  cooldownSeconds?: number
  /**
   * Optional: tells apart genuinely different problems that share one `key` (for example a Meta error
   * code, an event type, a template name). Each distinct fingerprint has its own cooldown. It is
   * lowercased, restricted to [a-z0-9:_-] and cut to 40 chars. Use ONLY small, bounded sets of values:
   * never raw error text, phone numbers, emails or ids with unbounded cardinality.
   */
  fingerprint?: string
}

export interface AlertRedis {
  set(key: string, value: string, opts: { nx?: true; ex: number }): Promise<unknown>
  get(key: string): Promise<unknown>
  incr(key: string): Promise<number>
  decr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
  del(key: string): Promise<unknown>
}
export interface AlertSupabase {
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }> }
}
export interface AlertDeps {
  /** null = Redis not configured: in-memory dedupe only. */
  redis: AlertRedis | null
  fetch: typeof fetch
  supabase: () => AlertSupabase | Promise<AlertSupabase>
  sentry?: (title: string) => void | Promise<void>
  now: () => number
  env: Record<string, string | undefined>
}

const TOTAL_TIMEOUT_MS = 4000
const GATE_TIMEOUT_MS = 1500
const SINK_TIMEOUT_MS = 2400
const MEMORY_MAX_KEYS = 200
const BODY_MAX = 1500
/** Warnings stop at this share of the hourly cap so they cannot starve criticals. */
const WARNING_SHARE = 0.7
const DEFAULT_MAX_PER_HOUR = 30
/** Suppressed-repeat counts at which one "STILL FAILING" update is sent while the cooldown is still active. */
export const ESCALATION_THRESHOLDS = [25, 100]
/** How long the last-alert marker (used to tell NEW issues from repeats) is remembered. */
const LAST_ALERT_TTL_S = 86400
/** Extra life for repeat counters so they outlast the cooldown they belong to. */
const COUNTER_GRACE_S = 600
const FINGERPRINT_MAX = 40

/** Dedupe identity: the key, plus `#fingerprint` when the alert carries one. */
export function sanitizeFingerprint(fp: string | undefined): string {
  return (fp ?? '').toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, FINGERPRINT_MAX)
}
export function effectiveKey(input: Pick<AlertInput, 'key' | 'fingerprint'>): string {
  const fp = sanitizeFingerprint(input.fingerprint)
  return fp ? `${input.key}#${fp}` : input.key
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(undefined), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(undefined) })
  })
}

function parseMax(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_PER_HOUR
}

/**
 * Strip personal data before anything is sent or stored. UUIDs and ISO dates are left alone
 * (their digit runs would otherwise look like phone numbers); numbers under 8 digits are kept.
 */
export function scrubPii(text: string): string {
  return text
    // Sentry links are kept whole: their issue ids are long digit runs but hold no personal data, and
    // redacting them would make the link in the alert useless.
    .split(/(https:\/\/[\w.-]*sentry\.io\/[^\s]*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2})/i)
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part
        .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
        .replace(/Bearer\s+[\w.~+/=-]+/gi, '[token]')
        .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
        .replace(/\+?\d(?:[ -]?\d){7,}/g, '[number]')
    })
    .join('')
}

const TELEGRAM_MAX = 4096
const NOTIFICATION_BODY_MAX = 400

const defaultCooldown = (severity: AlertSeverity) => (severity === 'critical' ? 1800 : 21600)

function muteHint(cooldownSeconds: number): string {
  const mins = Math.round(cooldownSeconds / 60)
  return mins < 60 ? `Repeats are muted for ${mins} min` : `Repeats are muted for ${Math.round(mins / 60)} h`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** e.g. "24 Oct 2026, 10:12 PM IST (16:42 UTC)". IST is a fixed UTC+5:30, no DST. */
export function formatIstUtc(nowMs: number): string {
  const ist = new Date(nowMs + 330 * 60_000)
  const h24 = ist.getUTCHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const two = (n: number) => String(n).padStart(2, '0')
  const utc = new Date(nowMs)
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${h12}:${two(ist.getUTCMinutes())} ${h24 < 12 ? 'AM' : 'PM'} IST (${two(utc.getUTCHours())}:${two(utc.getUTCMinutes())} UTC)`
}

// Ops message for the owner's Telegram, not product UI: these three circles are the only emojis used.
function marker(input: AlertInput): { symbol: string; word: string } {
  if (input.key.startsWith('drill:')) return { symbol: '\u{1F535}', word: 'DRILL' } // blue
  return input.severity === 'critical'
    ? { symbol: '\u{1F534}', word: 'CRITICAL' } // red
    : { symbol: '\u{1F7E1}', word: 'WARNING' } // yellow
}

const numbered = (items: string[]) => items.map((t, i) => `${i + 1}. ${escapeHtml(t)}`).join('\n')

/**
 * Structured Telegram message (HTML parse mode). Details are truncated first when the message would
 * pass Telegram's 4096 limit; the check and fix steps are never cut.
 */
export interface RepeatInfo {
  /** Suppressed repeats since the previous alert for this key. */
  repeats?: number
  /** When the previous alert for this key was sent (ms). */
  lastAt?: number
}

/** e.g. "10:12 PM IST". */
export function formatIstShort(nowMs: number): string {
  return formatIstUtc(nowMs).split(', ')[1].split(' (')[0]
}

function repeatLine(info?: RepeatInfo): string {
  if (!info?.repeats || info.repeats <= 0) return ''
  const when = info.lastAt ? ` (first alert ${formatIstShort(info.lastAt)})` : ''
  return `This happened ${info.repeats} more times since the last alert${when}.`
}

export function buildTelegramText(input: AlertInput, env: string, nowMs: number, cooldownSeconds?: number, info?: RepeatInfo): string {
  const guide = getAlertGuide(input.key)
  const repeat = repeatLine(info)
  const m = marker(input)
  const cooldown = cooldownSeconds ?? input.cooldownSeconds ?? defaultCooldown(input.severity)
  // Gym id goes first so truncating a long body never cuts it.
  const detailsRaw = [input.gymId ? `gym: ${input.gymId}` : '', input.body.trim()].filter(Boolean).join('\n')

  const render = (detailMax: number): string => {
    let details = detailsRaw
    if (details.length > detailMax) details = `${details.slice(0, Math.max(0, detailMax))}...`
    const parts = [
      `${m.symbol} <b>${m.word}: ${escapeHtml(input.title)}</b>`,
      `<b>What is happening</b>\n${escapeHtml(guide.happening)}`,
      `<b>What is failing</b>\n${escapeHtml(guide.failing)}`,
    ]
    if (repeat) parts.push(`<i>${escapeHtml(repeat)}</i>`)
    if (detailsRaw && detailMax > 0) parts.push(`<b>Details</b>\n<pre>${escapeHtml(details)}</pre>`)
    parts.push(`<b>What to check</b>\n${numbered(guide.check)}`)
    parts.push(`<b>How to fix</b>\n${numbered(guide.fix)}`)
    if (guide.links?.length) {
      parts.push(`<b>Links</b>\n${guide.links.map(l => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`).join('\n')}`)
    }
    parts.push(
      `<i>${escapeHtml(env)} | ${formatIstUtc(nowMs)}</i>\n<code>${escapeHtml(effectiveKey(input))}</code>\n<i>${muteHint(cooldown)}</i>`,
    )
    return parts.join('\n\n')
  }

  let max = BODY_MAX
  let text = render(max)
  while (text.length > TELEGRAM_MAX && max > 0) {
    max = Math.max(0, max - Math.max(50, text.length - TELEGRAM_MAX))
    text = render(max)
  }
  return text
}

/** Short system message (cap notice): same look, no guide. */
export function buildSystemText(title: string, body: string, env: string, nowMs: number): string {
  return [
    `\u{1F7E1} <b>WARNING: ${escapeHtml(title)}</b>`,
    escapeHtml(body),
    `<i>${escapeHtml(env)} | ${formatIstUtc(nowMs)}</i>`,
  ].join('\n\n')
}

/** Compact body for the admin app list: scrubbed body plus the first thing to check. */
export function buildNotificationBody(input: AlertInput, info?: RepeatInfo): string {
  const repeat = repeatLine(info)
  const first = `First step: ${getAlertGuide(input.key).check[0]}`
  const tail = repeat ? `${repeat}\n${first}` : first
  const room = Math.max(0, NOTIFICATION_BODY_MAX - tail.length - 1)
  const body = input.body.length > room ? `${input.body.slice(0, Math.max(0, room - 3))}...` : input.body
  return body ? `${body}\n${tail}` : tail
}

/** "STILL FAILING" update for an open issue that keeps repeating. Plain and short, not the full guide. */
export function buildUpdateText(input: AlertInput, count: number, since: number | undefined, env: string, nowMs: number): string {
  const m = marker(input)
  const when = since ? ` since ${formatIstShort(since)}` : ''
  return [
    `${m.symbol} <b>STILL FAILING: ${escapeHtml(input.title)}</b> (${count} occurrences${when})`,
    `First check: ${escapeHtml(getAlertGuide(input.key).check[0])}`,
    `<code>${escapeHtml(effectiveKey(input))}</code>\n<i>${escapeHtml(env)} | ${formatIstUtc(nowMs)}</i>`,
  ].join('\n\n')
}

type Verdict = {
  verdict: 'send' | 'dup' | 'cap' | 'update'
  notice?: boolean
  suppressed?: number
  /** send: suppressed repeats since the previous alert. update: the count that hit the threshold. */
  repeats?: number
  lastAt?: number
}

const toMs = (raw: unknown): number | undefined => {
  const n = Number(raw)
  return raw != null && Number.isFinite(n) && n > 0 ? n : undefined
}

export function createAlerter(deps: AlertDeps) {
  // Per-instance fallback so a Redis outage still alerts (and still dedupes).
  const memory = new Map<string, number>() // key -> expiry ms
  const memCap = { hour: '', count: 0, suppressed: 0, noticeHour: '' }

  function memClaim(key: string, ttlMs: number): boolean {
    const now = deps.now()
    const exp = memory.get(key)
    if (exp !== undefined && exp > now) return false
    memory.delete(key)
    memory.set(key, now + ttlMs)
    while (memory.size > MEMORY_MAX_KEYS) {
      const oldest = memory.keys().next().value
      if (oldest === undefined) break
      memory.delete(oldest)
    }
    return true
  }

  // In-memory mirrors of the Redis state (supp counter, last-alert time, fired escalations), bounded.
  const memSupp = new Map<string, number>()
  const memLast = new Map<string, number>()
  const memEsc = new Set<string>()
  const bound = <V,>(m: Map<string, V>) => {
    while (m.size > MEMORY_MAX_KEYS) {
      const oldest = m.keys().next().value
      if (oldest === undefined) break
      m.delete(oldest)
    }
  }

  async function redisGate(
    r: AlertRedis, input: AlertInput, eff: string, cooldown: number, max: number, warnLimit: number, hour: string, nowMs: number,
  ): Promise<Verdict> {
    const dedupeKey = `alert:${eff}`
    const lastKey = `alert:last:${eff}`
    const suppKey = `alert:supp:${eff}`
    const countKey = `alert:count:${hour}`
    const claimed = await r.set(dedupeKey, String(nowMs), { nx: true, ex: cooldown })

    if (!claimed) {
      // Muted repeat: one INCR. It never touches the hourly cap.
      const n = await r.incr(suppKey)
      if (n === 1) await r.expire(suppKey, cooldown + COUNTER_GRACE_S)
      if (!ESCALATION_THRESHOLDS.includes(n)) return { verdict: 'dup' }
      const fresh = await r.set(`alert:esc:${eff}:${n}`, '1', { nx: true, ex: cooldown + COUNTER_GRACE_S })
      if (!fresh) return { verdict: 'dup' }
      const c = await r.incr(countKey)
      if (c === 1) await r.expire(countKey, 3700)
      if (c > warnLimit) { await r.decr(countKey); return { verdict: 'dup' } } // updates use the repeat share
      return { verdict: 'update', repeats: n, lastAt: toMs(await r.get(lastKey)) }
    }

    const lastAt = toMs(await r.get(lastKey))
    // A key with no alert in the last 24 h is a NEW issue: it may use the full cap like a critical.
    const limit = input.severity === 'critical' || lastAt === undefined ? max : warnLimit
    const count = await r.incr(countKey)
    if (count === 1) await r.expire(countKey, 3700)
    if (count <= limit) {
      const repeats = Number((await r.get(suppKey)) ?? 0) || 0
      if (repeats > 0) await r.del(suppKey)
      await r.set(lastKey, String(nowMs), { ex: LAST_ALERT_TTL_S })
      return { verdict: 'send', repeats, lastAt }
    }
    // Nothing was delivered: hand the slot and the dedupe key back so a later occurrence can retry.
    await r.decr(countKey)
    await r.del(dedupeKey)
    const sKey = `alert:capcount:${hour}`
    const suppressed = await r.incr(sKey)
    if (suppressed === 1) await r.expire(sKey, 3700)
    const first = await r.set(`alert:capnotice:${hour}`, '1', { nx: true, ex: 3700 })
    return { verdict: 'cap', notice: !!first, suppressed }
  }

  function memGate(input: AlertInput, eff: string, cooldown: number, max: number, warnLimit: number, hour: string): Verdict {
    const key = `alert:${eff}`
    const now = deps.now()
    if (!memClaim(key, cooldown * 1000)) {
      const n = (memSupp.get(eff) ?? 0) + 1
      memSupp.set(eff, n)
      bound(memSupp)
      if (!ESCALATION_THRESHOLDS.includes(n)) return { verdict: 'dup' }
      const escKey = `${eff}:${n}`
      if (memEsc.has(escKey)) return { verdict: 'dup' }
      memEsc.add(escKey)
      if (memCap.hour !== hour) { memCap.hour = hour; memCap.count = 0; memCap.suppressed = 0 }
      if (memCap.count + 1 > warnLimit) return { verdict: 'dup' }
      memCap.count++
      return { verdict: 'update', repeats: n, lastAt: memLast.get(eff) }
    }
    const lastAt = memLast.get(eff)
    const fresh = lastAt === undefined || now - lastAt > LAST_ALERT_TTL_S * 1000
    const limit = input.severity === 'critical' || fresh ? max : warnLimit
    if (memCap.hour !== hour) { memCap.hour = hour; memCap.count = 0; memCap.suppressed = 0 }
    memCap.count++
    if (memCap.count <= limit) {
      const repeats = memSupp.get(eff) ?? 0
      memSupp.delete(eff)
      memLast.set(eff, now)
      bound(memLast)
      return { verdict: 'send', repeats, lastAt: fresh ? undefined : lastAt }
    }
    memCap.count--
    memory.delete(key)
    memCap.suppressed++
    const notice = memCap.noticeHour !== hour
    memCap.noticeHour = hour
    return { verdict: 'cap', notice, suppressed: memCap.suppressed }
  }

  async function gate(input: AlertInput, eff: string): Promise<Verdict & { release: () => Promise<void>; cooldown: number }> {
    const cooldown = input.cooldownSeconds ?? defaultCooldown(input.severity)
    const max = parseMax(deps.env.ALERT_MAX_PER_HOUR)
    const warnLimit = Math.max(1, Math.floor(max * WARNING_SHARE))
    const nowMs = deps.now()
    const hour = new Date(nowMs).toISOString().slice(0, 13).replace(/[-T]/g, '')
    const r = deps.redis
    let v: Verdict | undefined
    if (r) {
      // Upstash retries with backoff, so a slow Redis must not eat the whole alert budget.
      v = await withTimeout(redisGate(r, input, eff, cooldown, max, warnLimit, hour, nowMs), GATE_TIMEOUT_MS)
    }
    const usedRedis = !!v
    if (!v) v = memGate(input, eff, cooldown, max, warnLimit, hour) // Redis down/slow/unset: the outage itself still alerts
    const release = async () => {
      memory.delete(`alert:${eff}`)
      if (usedRedis && r) await withTimeout(r.del(`alert:${eff}`), 1000)
    }
    return { ...v, release, cooldown }
  }

  /** True when Telegram confirmed delivery, or is not configured (a retry would be pointless). */
  async function telegram(text: string): Promise<boolean> {
    const token = deps.env.TELEGRAM_BOT_TOKEN
    const chat = deps.env.TELEGRAM_CHAT_ID
    if (!token || !chat) {
      logger.warn('alert: telegram not configured, skipped')
      return true
    }
    try {
      const res = await deps.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) logger.error('alert: telegram send failed', { status: res.status })
      return res.ok
    } catch (e) {
      // Log only the error name: fetch errors can embed the URL, and so the bot token.
      logger.error('alert: telegram send failed', { reason: e instanceof Error ? e.name : 'unknown' })
      return false
    }
  }

  async function history(input: AlertInput, eff: string, info?: RepeatInfo, update?: { title: string; body: string }): Promise<boolean> {
    try {
      // Service role is used because the caller is server code with no user session and the
      // notifications table is service-role only. Input is server-built, never client input.
      const sb = await deps.supabase()
      const { error } = await sb.from('notifications').insert({
        type: 'alert', gym_id: input.gymId ?? null, title: update?.title ?? input.title, body: update?.body ?? buildNotificationBody(input, info), entity_id: eff,
      })
      if (error) { logger.warn('alert: history insert failed', { reason: error.message }); return false }
      return true
    } catch (e) {
      logger.warn('alert: history insert failed', { reason: e instanceof Error ? e.message : 'unknown' })
      return false
    }
  }

  async function run(raw: AlertInput): Promise<void> {
    const env = deps.env
    if (env.ALERTS_DISABLED === '1') return
    if (env.NODE_ENV === 'test') return
    const input: AlertInput = { ...raw, title: scrubPii(raw.title), body: scrubPii(raw.body) }
    const eff = effectiveKey(input)
    const g = await gate(input, eff)
    if (g.verdict === 'dup') return
    const envName = env.VERCEL_ENV ?? env.NODE_ENV ?? 'unknown'
    if (g.verdict === 'update') {
      const count = g.repeats ?? 0
      const since = g.lastAt ? ` since ${formatIstShort(g.lastAt)}` : ''
      const tgU = withTimeout(telegram(buildUpdateText(input, count, g.lastAt, envName, deps.now())), SINK_TIMEOUT_MS)
      const histU = withTimeout(history(input, eff, undefined, {
        title: `STILL FAILING: ${input.title}`,
        body: `${count} occurrences${since}.\nFirst step: ${getAlertGuide(input.key).check[0]}`.slice(0, NOTIFICATION_BODY_MAX),
      }), SINK_TIMEOUT_MS)
      await Promise.allSettled([tgU, histU])
      return
    }
    const info: RepeatInfo = { repeats: g.repeats, lastAt: g.lastAt }
    if (g.verdict === 'cap') {
      if (g.notice) {
        const text = buildSystemText(
          'Alert cap reached',
          `alert cap reached, ${g.suppressed ?? 0} suppressed. See the admin app and Vercel logs for what is failing.`,
          envName,
          deps.now(),
        )
        await withTimeout(telegram(text), SINK_TIMEOUT_MS)
      }
      return
    }
    logger.error('alert raised', { alertKey: eff, severity: input.severity })
    const tg = withTimeout(telegram(buildTelegramText(input, envName, deps.now(), g.cooldown, info)), SINK_TIMEOUT_MS)
    const hist = withTimeout(history(input, eff, info), SINK_TIMEOUT_MS)
    const sinks: Promise<unknown>[] = [tg, hist]
    // sentry:* alerts come FROM Sentry; re-capturing them would open a new issue that fires the same alert again.
    if (input.severity === 'critical' && deps.sentry && !input.key.startsWith('sentry:')) {
      const sentry = deps.sentry
      sinks.push(withTimeout((async () => { try { await sentry(input.title) } catch { /* ignore */ } })(), SINK_TIMEOUT_MS))
    }
    await Promise.allSettled(sinks)
    // Nothing delivered anywhere: free the cooldown so the next occurrence retries.
    if ((await tg) !== true && (await hist) !== true) await g.release()
  }

  async function report(input: AlertInput): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        run(input).catch(() => {}),
        new Promise<void>(r => { timer = setTimeout(r, TOTAL_TIMEOUT_MS) }),
      ])
    } catch {
      // alerting must never break the caller
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  return { report }
}

function realDeps(): AlertDeps {
  // lib/redis.ts warns on every unconfigured getRedisClient() call, so check the env ourselves.
  const haveRedis = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  return {
    redis: haveRedis
      ? {
          set: async (k, v, o) => (await import('@/lib/redis')).redis.set(k, v, o.nx ? { nx: true, ex: o.ex } : { ex: o.ex }),
          incr: async k => (await import('@/lib/redis')).redis.incr(k),
          decr: async k => (await import('@/lib/redis')).redis.decr(k),
          get: async k => (await import('@/lib/redis')).redis.get(k),
          expire: async (k, s) => (await import('@/lib/redis')).redis.expire(k, s),
          del: async k => (await import('@/lib/redis')).redis.del(k),
        }
      : null,
    fetch: (...a) => fetch(...a),
    supabase: async () => (await import('@/lib/supabase/admin')).createAdminClient() as unknown as AlertSupabase,
    sentry: async title => { (await import('@sentry/nextjs')).captureMessage(title, 'error') },
    now: () => Date.now(),
    env: process.env as Record<string, string | undefined>,
  }
}

let defaultAlerter: ReturnType<typeof createAlerter> | null = null

/** Awaitable. Never throws, never rejects, resolves within ~4 s even if every sink hangs. */
export async function reportAlert(input: AlertInput): Promise<void> {
  try {
    defaultAlerter ??= createAlerter(realDeps())
    await defaultAlerter.report(input)
  } catch {
    // never throw
  }
}

/** Schedules via next/server `after()` inside a request scope, otherwise fire-and-forget. */
export function reportAlertInBackground(input: AlertInput): void {
  try {
    after(() => reportAlert(input))
  } catch {
    try { void reportAlert(input).catch(() => {}) } catch { /* ignore */ }
  }
}
