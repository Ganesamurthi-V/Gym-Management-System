/**
 * lib/whatsapp/queue.ts
 *
 * Throttled outbound WhatsApp send queue.
 *
 * Bulk automated sends (post-import batch + daily cron) are ENQUEUED into
 * whatsapp_send_queue rather than dispatched inline, then drained at a fixed
 * global rate (BATCH_SIZE = 100 sends per DRAIN_INTERVAL) so the single shared
 * WhatsApp Cloud API number is never flagged as spamming.
 *
 * Cadence is driven by QStash: after draining a batch, if work remains the
 * drain self-schedules the next run DRAIN_INTERVAL_MINUTES later. A global
 * Upstash rate token is the hard ceiling, so overlapping triggers (an import
 * firing mid-cron) can never collectively exceed the limit.
 *
 * The idempotency contract is unchanged: each queue row carries the id of its
 * pre-claimed whatsapp_automation_logs row (logRowId), reconciled via
 * finalizeSendRow after the real send.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate } from './sender'
import { finalizeSendRow } from './finalize'
import { QUEUE_RECIPIENT_CAP } from './recipientLimit'
import type { TemplateContext, TemplateId, SendResult } from '@/types/whatsapp'
import { reportAlertInBackground } from '@/lib/monitoring/alert'

/**
 * Increment a Redis counter and set its TTL. Returns null (never throws) when Redis is not
 * configured or errors: alerting counters must never break a send path. Uses the exported client
 * only when both env vars are set, so an unconfigured dev setup does not log warnings.
 */
async function bumpCounter(key: string, ttlSeconds: number): Promise<number | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  try {
    const { redis } = await import('@/lib/redis')
    const n = await redis.incr(key)
    await redis.expire(key, ttlSeconds)
    return n
  } catch {
    return null
  }
}

/** Publishes per UTC day at which we warn (QStash free tier allows 1000/day). */
export const QSTASH_BUDGET_WARN_AT = 800

// ─── Cadence constants ──────────────────────────────────────────────────────

/** Messages sent per drain window; also the global sliding-window limit (BATCH_SIZE per DRAIN_INTERVAL_MINUTES). */
export const BATCH_SIZE = 100
/** Minutes between drain batches. */
export const DRAIN_INTERVAL_MINUTES = 5
/**
 * Wall-clock budget for one drain invocation. The route has maxDuration = 60 s; 100 sequential
 * sends (token + claim + Meta call + updates, up to ~1 s each) can exceed that, and a function
 * killed mid-batch leaves claimed rows 'sending' until the 10 min lease, risking a duplicate send.
 * 40 s leaves ~20 s for the in-flight send, the reaper, the final count query, the reschedule
 * publish and cold start. The loop stops CLAIMING at the budget; a claimed row is always finished.
 */
export const DRAIN_TIME_BUDGET_MS = 40_000
/** Delay before the follow-up drain when a drain stopped on the time budget with work left. */
export const CONTINUATION_DELAY_MINUTES = 1
/**
 * How long a row may sit in 'sending' before it is treated as never sent. A status webhook
 * confirming an accepted send normally arrives within ~1 minute; 10 minutes is a generous
 * grace before we assume the worker died before Meta accepted the message and retry it.
 */
export const LEASE_MINUTES = 10

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Delay between attempts to persist 'sent' after a successful send. */
const PERSIST_RETRY_DELAY_MS = 100

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnqueueParams {
  gymId: string
  memberId: string
  templateName: TemplateId
  context: TemplateContext
  cycleKey: string
  triggerDate?: string
  /** The pre-claimed whatsapp_automation_logs row id this send reconciles. */
  logRowId: string | null
}

interface QueueRow {
  id: string
  gym_id: string | null
  member_id: string
  template_name: TemplateId
  context: TemplateContext
  log_row_id: string | null
  attempts: number
  max_attempts: number
}

export interface DrainStats {
  drained: number
  sent: number
  failed: number
  retried: number
  /** Rows put back because Meta's 24 h unique-recipient limit is reached (not attempts). */
  deferred: number
  /** Sends whose outcome is unknown (timeout / 5xx); left 'sending' for webhook or lease. */
  unconfirmed: number
  /** Stale 'sending' rows returned to pending (or failed) by the lease reaper. */
  reaped: number
  remaining: number
  rescheduled: boolean
  /** The loop stopped claiming because DRAIN_TIME_BUDGET_MS elapsed. */
  timeBudgetHit: boolean
}

// ─── Enqueue ────────────────────────────────────────────────────────────────

/**
 * Insert a pending queue row. The partial unique index
 * (member_id, template_name, cycle_key) WHERE status IN ('pending','sending')
 * makes a duplicate enqueue a no-op rather than an error.
 */
export async function enqueueSend(
  supabase: SupabaseClient,
  params: EnqueueParams,
): Promise<{ enqueued: boolean }> {
  const { error } = await supabase.from('whatsapp_send_queue').insert({
    gym_id: params.gymId,
    member_id: params.memberId,
    template_name: params.templateName,
    context: params.context,
    cycle_key: params.cycleKey,
    trigger_date: params.triggerDate ?? null,
    log_row_id: params.logRowId,
    status: 'pending',
  })

  if (error) {
    if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
      return { enqueued: false }
    }
    console.error('[WA Queue] enqueue failed:', error.message)
    // A reminder that is not queued is silently never sent; the owner must hear about it.
    reportAlertInBackground({
      key: 'wa:enqueue_failed', fingerprint: params.templateName, severity: 'critical', title: 'WhatsApp message not queued',
      body: `Template ${params.templateName}, gym ${params.gymId}: ${error.message}`,
      gymId: params.gymId,
    })
    return { enqueued: false }
  }
  return { enqueued: true }
}

// ─── Confirmation and lease recovery ─────────────────────────────────────────

/**
 * Mark a queue row sent because Meta confirmed it (status webhook echoing the row id as
 * biz_opaque_callback_data). 'pending' is included on purpose: a retry that was already
 * re-queued is cancelled by this instead of being resent. Idempotent: a row that is already
 * sent (or failed/cancelled) no longer matches, so a repeat returns { updated: false }.
 */
export async function confirmQueuedSend(
  supabase: SupabaseClient,
  queueRowId: string,
  messageId: string,
): Promise<{ updated: boolean }> {
  if (!UUID_RE.test(queueRowId)) return { updated: false }

  const { data, error } = await supabase
    .from('whatsapp_send_queue')
    .update({ status: 'sent', message_id: messageId, sent_at: new Date().toISOString(), last_error: null })
    .eq('id', queueRowId)
    .in('status', ['sending', 'pending'])
    .select('id')
  if (error) {
    console.error('[WA Queue] confirm failed:', error.message)
    return { updated: false }
  }
  return { updated: Array.isArray(data) ? data.length > 0 : !!data }
}

/**
 * Resolve rows stuck in 'sending' past the lease (worker died, or the outcome was unknown
 * and no webhook confirmed it). Under the attempt cap they go back to pending for one more
 * try, otherwise they fail. Every update is guarded by status='sending' so a worker that is
 * finishing at the same moment is not clobbered.
 */
async function reapStaleSends(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString()
  const { data, error } = await supabase
    .from('whatsapp_send_queue')
    .select('id, attempts, max_attempts')
    .eq('status', 'sending')
    .lte('locked_at', cutoff)
  if (error) {
    console.error('[WA Queue] reap select failed:', error.message)
    reportAlertInBackground({ key: 'wa:queue_persist', severity: 'warning', title: 'WhatsApp queue database errors',
      body: `Stale-send reaper select failed: ${error.message}` })
    return 0
  }
  if (!Array.isArray(data)) return 0

  let reaped = 0
  let reapErrors = 0
  for (const r of data as Array<{ id: string; attempts: number; max_attempts: number }>) {
    const patch = r.attempts >= r.max_attempts
      ? { status: 'failed', last_error: 'unconfirmed send; attempts exhausted' }
      : {
          status: 'pending',
          locked_at: null,
          scheduled_at: new Date().toISOString(),
          last_error: 'unconfirmed send; no webhook confirmation within lease, retrying',
        }
    const { data: done, error: updErr } = await supabase
      .from('whatsapp_send_queue')
      .update(patch)
      .eq('id', r.id)
      .eq('status', 'sending')
      .select('id')
    if (updErr) {
      console.error('[WA Queue] reap update failed:', updErr.message)
      reapErrors++
      continue
    }
    if (Array.isArray(done) ? done.length > 0 : !!done) reaped++
  }
  if (reapErrors > 0) {
    reportAlertInBackground({ key: 'wa:queue_persist', severity: 'warning', title: 'WhatsApp queue database errors',
      body: `Stale-send reaper: ${reapErrors} update(s) failed, ${reaped} reaped.` })
  }
  return reaped
}

/** Persist the 'sent' state, retrying briefly: the message is already out, so losing this write must be rare. */
async function persistSent(supabase: SupabaseClient, rowId: string, messageId: string | null): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      const { error } = await supabase
        .from('whatsapp_send_queue')
        .update({ status: 'sent', message_id: messageId, sent_at: new Date().toISOString(), last_error: null })
        .eq('id', rowId)
      if (!error) return true
      console.error('[WA Queue] persist sent failed:', error.message)
    } catch (err) {
      console.error('[WA Queue] persist sent threw:', err instanceof Error ? err.message : String(err))
    }
    if (i < 2) await new Promise(r => setTimeout(r, PERSIST_RETRY_DELAY_MS))
  }
  return false
}

// ─── QStash drain trigger ─────────────────────────────────────────────────────

/** Is QStash configured? When not (local/dev), callers drain inline instead. */
export function isQStashConfigured(): boolean {
  return !!process.env.QSTASH_TOKEN && !!drainUrl()
}

function drainUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  return base ? `${base}/api/whatsapp/queue/drain` : null
}

/**
 * Ask QStash to invoke the drain endpoint after `delayMinutes`. QStash's HTTP
 * publish carries a signed token the drain route verifies. Returns false (and
 * logs) if publishing failed or QStash isn't configured — the daily cron is
 * always the backstop, so a missed kick just delays sends, never drops them.
 */
/**
 * QStash deduplication id. Normal and immediate kicks share an id per 5-minute window and delay
 * so concurrent kicks (e.g. several gyms in the daily cron) collapse into one. A continuation
 * kick is unique per call: two continuations inside one window must both be delivered, or the
 * second would be silently dropped and the chain would stall until the next 5-minute kick.
 */
export function drainDedupId(delayMinutes: number, nowMs: number, continuation = false): string {
  if (continuation) return `wa-drain-cont-${nowMs}`
  return `wa-drain-d${delayMinutes}-${Math.floor(nowMs / (DRAIN_INTERVAL_MINUTES * 60_000))}`
}

async function alertPublishFailure(status: number | null): Promise<void> {
  if (status === 429) {
    reportAlertInBackground({ key: 'wa:qstash_quota', severity: 'critical', title: 'QStash daily quota hit',
      body: 'QStash returned 429; queued WhatsApp messages will not drain until the quota resets.' })
  } else if (status === 401 || status === 403 || status === 404) {
    reportAlertInBackground({ key: 'wa:qstash_auth', severity: 'critical', title: `QStash token or URL wrong (HTTP ${status})`,
      body: `QStash publish returned HTTP ${status}; check QSTASH_TOKEN and QSTASH_URL (region).` })
  } else {
    reportAlertInBackground({ key: 'wa:qstash_publish', fingerprint: status === null ? 'network' : String(status), severity: 'critical', title: 'QStash publish failed',
      body: status === null ? 'QStash publish threw a network error.' : `QStash publish returned HTTP ${status}.` })
  }
}

/** Bounded class of a send error, so different failure kinds alert separately without unbounded keys. */
function sendErrorClass(message: string): string {
  const m = message.toLowerCase()
  if (/token|oauth|190|unauthor/.test(m)) return 'token'
  if (/template/.test(m)) return 'template'
  if (/rate|limit|131056|130429/.test(m)) return 'rate_limit'
  if (/timeout|timed out|network|fetch/.test(m)) return 'network'
  return 'other'
}

export async function kickDrain(delayMinutes = 0, opts: { continuation?: boolean } = {}): Promise<boolean> {
  const url = drainUrl()
  const token = process.env.QSTASH_TOKEN
  if (!url || !token) {
    reportAlertInBackground({
      key: 'wa:qstash_publish', fingerprint: 'not_configured', severity: 'critical', title: 'QStash not configured',
      body: 'QSTASH_TOKEN or NEXT_PUBLIC_APP_URL is missing, so the WhatsApp queue cannot be scheduled.',
    })
    return false
  }

  // QStash is regional: a token only works against its own region's endpoint (a US-region token
  // against the default EU address gets 404 "user not found in this region"), so every publish
  // failed and nothing ever drained. QSTASH_URL is Upstash's standard variable for the endpoint.
  const qstashBase = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '')

  try {
    const res = await fetch(`${qstashBase}/v2/publish/` + encodeURIComponent(url), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // QStash delays delivery by this many seconds.
        ...(delayMinutes > 0 ? { 'Upstash-Delay': `${delayMinutes * 60}s` } : {}),
        // See drainDedupId: delay is part of the id so an immediate kick and a reschedule never
        // collide, and continuation kicks are unique per call.
        'Upstash-Deduplication-Id': drainDedupId(delayMinutes, Date.now(), opts.continuation),
      },
      body: JSON.stringify({ trigger: 'drain' }),
    })
    if (!res.ok) {
      console.error('[WA Queue] kickDrain publish failed:', res.status, await res.text().catch(() => ''))
      await alertPublishFailure(res.status)
      return false
    }
    // Daily publish counter: QStash's free tier is 1000/day, so warn well before it is hit.
    const count = await bumpCounter(`qstash:publishes:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, 172800)
    if (count === QSTASH_BUDGET_WARN_AT) {
      reportAlertInBackground({
        key: 'wa:qstash_budget', severity: 'warning', title: 'QStash publishes 800 of 1000 today',
        body: 'The daily QStash publish budget is 80% used; the queue may stall when it runs out.',
      })
    }
    return true
  } catch (err) {
    console.error('[WA Queue] kickDrain error:', err instanceof Error ? err.message : String(err))
    await alertPublishFailure(null)
    return false
  }
}

// ─── Drain core (dependency-injected for testability) ─────────────────────────

export interface DrainDeps {
  supabase: SupabaseClient
  /** Send one template; defaults to the real Meta sender. */
  sender?: (templateId: TemplateId, ctx: TemplateContext) => Promise<SendResult>
  /** Consume one global rate token; resolves { success, remaining }. */
  takeToken?: () => Promise<{ success: boolean; remaining: number }>
  /** Schedule the next drain batch; defaults to QStash kickDrain. */
  reschedule?: (delayMinutes: number, opts?: { continuation?: boolean }) => Promise<boolean>
  /** Clock in ms; defaults to Date.now. Injectable so the time budget is testable. */
  now?: () => number
  /**
   * Runs only for 'member_app_invitation', right before the send, and returns the context to
   * send (with invitationToken filled). Tokens expire after 24h and a big gym can wait in the
   * queue for hours, so the token is minted here and never at enqueue time. permanent=true
   * fails the row for good; otherwise it follows the normal retry path.
   */
  prepare?: (row: PrepareRow) => Promise<
    { ok: true; context: TemplateContext } | { ok: false; error: string; permanent: boolean }
  >
}

export type PrepareRow = Pick<QueueRow, 'id' | 'gym_id' | 'context'> & { member_id: string }

/** Default prepare for invitations: mint the token with the service client. */
async function defaultPrepare(supabase: SupabaseClient, row: PrepareRow) {
  // Dynamic import: the module is server-only, and a static import would break every test and
  // Edge-free consumer that merely imports this file.
  const { prepareMemberInvitation } = await import('@/lib/member-invitation-server')
  const gymId = row.gym_id ?? row.context.gymId
  if (!gymId) return { ok: false as const, error: 'Queue row has no gym', permanent: true }
  const res = await prepareMemberInvitation(supabase, { gymId, memberId: row.member_id, skipIfActivated: true })
  if (!res.ok) return { ok: false as const, error: `${res.code}: ${res.message}`, permanent: res.permanent }
  return { ok: true as const, context: { ...row.context, invitationToken: res.token } }
}

let _sharedLimiter: Ratelimit | null = null
function defaultTakeToken(): Promise<{ success: boolean; remaining: number }> {
  if (!_sharedLimiter) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    _sharedLimiter = new Ratelimit({
      redis,
      // Global bucket shared by every drain invocation.
      limiter: Ratelimit.slidingWindow(BATCH_SIZE, `${DRAIN_INTERVAL_MINUTES} m`),
      prefix: 'wa-send-queue',
    })
  }
  return _sharedLimiter.limit('global').then(r => ({ success: r.success, remaining: r.remaining }))
}

/**
 * Drain up to BATCH_SIZE due rows, throttled by the global rate token and bounded by
 * DRAIN_TIME_BUDGET_MS, then reschedule if work remains (or the token bucket was empty).
 *
 * Row lifecycle per drain:
 *   pending → (claim: status='sending', locked_at, attempts++) → send
 *     success              → status='sent', message_id, sent_at; log reconciled
 *     ambiguous (timeout/5xx) → stays 'sending'; a status webhook confirms it (confirmQueuedSend)
 *                            or, after LEASE_MINUTES, the reaper requeues / fails it
 *     transient, retries<max→ status='pending', scheduled_at += interval
 *     permanent OR retries exhausted → status='failed'; log reconciled
 */
export async function drainSendQueue(deps: DrainDeps): Promise<DrainStats> {
  const supabase = deps.supabase
  const sender = deps.sender ?? sendWhatsAppTemplate
  const takeToken = deps.takeToken ?? defaultTakeToken
  const reschedule = deps.reschedule ?? kickDrain

  const stats: DrainStats = { drained: 0, sent: 0, failed: 0, retried: 0, deferred: 0, unconfirmed: 0, reaped: 0, remaining: 0, rescheduled: false, timeBudgetHit: false }
  const clock = deps.now ?? Date.now
  const startedAt = clock()
  let tokenExhausted = false
  let persistFailures = 0
  // Failed-row error classes this run (digits stripped so phone numbers never reach an alert).
  const failedErrors = new Map<string, number>()
  const noteFailed = (err: string | null | undefined) => {
    const cls = (err ?? 'unknown').replace(/\d+/g, '#').slice(0, 80)
    failedErrors.set(cls, (failedErrors.get(cls) ?? 0) + 1)
  }
  // Earliest time a denied recipient may be retried; sets the next drain delay.
  let earliestRetryAt: number | null = null

  const nowIso = () => new Date().toISOString()

  // Recover abandoned 'sending' rows before claiming, so a reaped row can go out in this drain.
  stats.reaped = await reapStaleSends(supabase)

  for (let i = 0; i < BATCH_SIZE; i++) {
    // Checked only between rows: a claimed row is always finished, never abandoned.
    if (clock() - startedAt > DRAIN_TIME_BUDGET_MS) { stats.timeBudgetHit = true; break }
    const token = await takeToken()
    if (!token.success) { tokenExhausted = true; break }

    // Claim the oldest due pending row atomically: flip to 'sending' guarded by
    // status='pending' so two concurrent drains can't grab the same row.
    const { data: candidate } = await supabase
      .from('whatsapp_send_queue')
      .select('id, gym_id, member_id, template_name, context, log_row_id, attempts, max_attempts')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!candidate) break // nothing due

    const row = candidate as QueueRow
    const { data: claimed } = await supabase
      .from('whatsapp_send_queue')
      .update({ status: 'sending', locked_at: nowIso(), attempts: row.attempts + 1 })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claimed) continue // lost the race to another drain; try the next row

    stats.drained++

    let result: SendResult
    // Set when prepare fails for good; the row is failed below without calling the sender.
    let prepareFailure: { error: string; permanent: boolean } | null = null
    try {
      // dedupeKey is the row id, identical on every attempt: Meta echoes it in status webhooks.
      let ctx: TemplateContext = { ...row.context, gymId: row.gym_id ?? row.context.gymId, memberRowId: row.member_id, dedupeKey: row.id, recipientCap: QUEUE_RECIPIENT_CAP }
      if (row.template_name === 'member_app_invitation') {
        const prep = await (deps.prepare ?? ((r) => defaultPrepare(supabase, r)))(row)
        if (prep.ok) ctx = { ...prep.context, gymId: ctx.gymId, memberRowId: row.member_id, dedupeKey: row.id, recipientCap: QUEUE_RECIPIENT_CAP }
        else prepareFailure = { error: prep.error, permanent: prep.permanent }
      }
      // gymId rides along so sendTemplate can check the gym's WhatsApp switch at the moment of
      // sending: a message queued before the admin turned WhatsApp off is stopped here.
      result = prepareFailure
        ? { success: false, error: prepareFailure.error }
        : await sender(row.template_name, ctx)
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    // finalizeSendRow ignores a null log_row_id, which is what invitation rows carry.

    // Reconcile the pre-claimed automation-log row (message id / failure status).
    await finalizeSendRow(supabase, row.log_row_id, result)

    if (result.deferred) {
      // The 24 h unique-recipient limit: nothing was sent, so this is not an attempt and not a
      // failure. Back to pending at the time a slot frees up, with the claim's attempts
      // increment reverted so a long wait cannot exhaust max_attempts.
      const retryMs = result.retryAt ? new Date(result.retryAt).getTime() : NaN
      const retryAtMs = Number.isNaN(retryMs) ? Date.now() + DRAIN_INTERVAL_MINUTES * 60_000 : retryMs
      await supabase
        .from('whatsapp_send_queue')
        .update({
          status: 'pending',
          scheduled_at: new Date(retryAtMs).toISOString(),
          locked_at: null,
          attempts: row.attempts,
          last_error: 'deferred: daily recipient limit',
        })
        .eq('id', row.id)
      stats.deferred++
      earliestRetryAt = earliestRetryAt === null ? retryAtMs : Math.min(earliestRetryAt, retryAtMs)
      // Every other NEW recipient would be denied too; stop and let the next drain re-check.
      break
    }

    if (result.success) {
      // If this write keeps failing the row stays 'sending': the webhook or the lease resolves it.
      const persisted = await persistSent(supabase, row.id, result.messageId ?? null)
      if (!persisted) {
        console.error('[WA Queue] row left sending after successful send:', row.id)
        persistFailures++
      }
      stats.sent++
      if (row.template_name === 'member_app_invitation') {
        const gymId = row.gym_id ?? row.context.gymId
        const { error: activityErr } = await supabase.from('member_portal_activity').insert({
          gym_id: gymId,
          member_id: row.member_id,
          activity: 'invitation_resent',
          performed_by: 'owner',
        })
        if (activityErr) console.warn('[WA Queue] invitation sent but activity log failed:', activityErr.message)
      }
    } else if (prepareFailure?.permanent) {
      // Retrying cannot fix this (activated, no phone, email conflict): fail once, no sender call.
      await supabase
        .from('whatsapp_send_queue')
        .update({ status: 'failed', last_error: prepareFailure.error })
        .eq('id', row.id)
      stats.failed++
      noteFailed(prepareFailure.error)
    } else if (result.skipped) {
      // Deliberately not sent (the gym's WhatsApp switch is off): finished, no retry.
      await supabase
        .from('whatsapp_send_queue')
        .update({ status: 'cancelled', last_error: result.error ?? null })
        .eq('id', row.id)
    } else if (result.ambiguous) {
      // Meta may have accepted it. Do not requeue or fail: stay 'sending' (locked_at kept) and
      // let the confirming webhook or the lease reaper decide.
      await supabase
        .from('whatsapp_send_queue')
        .update({ last_error: `unconfirmed: ${result.error ?? 'unknown'}` })
        .eq('id', row.id)
      stats.unconfirmed++
    } else if (row.attempts + 1 < row.max_attempts) {
      // Transient — back to pending, delayed one interval for the next batch.
      const next = new Date(Date.now() + DRAIN_INTERVAL_MINUTES * 60_000).toISOString()
      await supabase
        .from('whatsapp_send_queue')
        .update({ status: 'pending', scheduled_at: next, locked_at: null, last_error: result.error ?? null })
        .eq('id', row.id)
      stats.retried++
    } else {
      await supabase
        .from('whatsapp_send_queue')
        .update({ status: 'failed', last_error: result.error ?? null })
        .eq('id', row.id)
      stats.failed++
      noteFailed(result.error)
    }
  }

  // Is there still work to do? (rows due now, or retries queued for later)
  const { count } = await supabase
    .from('whatsapp_send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  stats.remaining = count ?? 0

  if (stats.timeBudgetHit && stats.remaining > 0 && !tokenExhausted && earliestRetryAt === null) {
    // Stopped for time, not for rate: continue shortly, with a per-call dedup id.
    stats.rescheduled = await reschedule(CONTINUATION_DELAY_MINUTES, { continuation: true })
  } else if (stats.remaining > 0 || tokenExhausted) {
    // After a deferral nothing new can go out until a slot frees up, so wait for that, but
    // re-check at least hourly in case the limit was raised or slots freed early.
    const untilRetry = earliestRetryAt === null ? DRAIN_INTERVAL_MINUTES : Math.ceil((earliestRetryAt - Date.now()) / 60_000)
    const delay = earliestRetryAt === null ? DRAIN_INTERVAL_MINUTES : Math.min(60, Math.max(1, untilRetry))
    stats.rescheduled = await reschedule(delay)
  }

  // Alerts last, so they can never hold back the reschedule above.
  if (stats.remaining > 0 && !stats.rescheduled) {
    reportAlertInBackground({ key: 'wa:drain_not_rescheduled', severity: 'critical', title: 'WhatsApp queue not rescheduled',
      body: `${stats.remaining} message(s) are still pending and the next drain could not be scheduled.` })
  }
  if (persistFailures > 0) {
    reportAlertInBackground({ key: 'wa:queue_persist', severity: 'warning', title: 'WhatsApp queue database errors',
      body: `${persistFailures} sent row(s) could not be marked sent this run (sent ${stats.sent}, reaped ${stats.reaped}).` })
  }
  if (stats.failed > 0) {
    const top = [...failedErrors.entries()].sort((a, b) => b[1] - a[1])[0]
    reportAlertInBackground({ key: 'wa:send_failed', fingerprint: sendErrorClass(top ? top[0] : ''), severity: 'warning', title: 'WhatsApp sends failed permanently',
      body: `${stats.failed} message(s) failed this run. Most common error: ${top ? top[0] : 'unknown'}.` })
  }

  return stats
}
