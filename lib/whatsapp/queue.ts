/**
 * lib/whatsapp/queue.ts
 *
 * Throttled outbound WhatsApp send queue.
 *
 * Bulk automated sends (post-import batch + daily cron) are ENQUEUED into
 * whatsapp_send_queue rather than dispatched inline, then drained at a fixed
 * global rate — BATCH_SIZE sends per DRAIN_INTERVAL — so the single shared
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

// ─── Cadence constants ──────────────────────────────────────────────────────

/** Messages sent per drain batch. */
export const BATCH_SIZE = 15
/** Minutes between drain batches. */
export const DRAIN_INTERVAL_MINUTES = 5
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
    return 0
  }
  if (!Array.isArray(data)) return 0

  let reaped = 0
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
      continue
    }
    if (Array.isArray(done) ? done.length > 0 : !!done) reaped++
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
export async function kickDrain(delayMinutes = 0): Promise<boolean> {
  const url = drainUrl()
  const token = process.env.QSTASH_TOKEN
  if (!url || !token) return false

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
        // Dedup within the same interval window. Include delayMinutes so an
        // immediate kick (delay=0) and a reschedule (delay=5) never collide —
        // otherwise the reschedule is silently dropped and the queue stalls.
        'Upstash-Deduplication-Id': `wa-drain-d${delayMinutes}-${Math.floor(Date.now() / (DRAIN_INTERVAL_MINUTES * 60_000))}`,
      },
      body: JSON.stringify({ trigger: 'drain' }),
    })
    if (!res.ok) {
      console.error('[WA Queue] kickDrain publish failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[WA Queue] kickDrain error:', err instanceof Error ? err.message : String(err))
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
  reschedule?: (delayMinutes: number) => Promise<boolean>
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
 * Drain up to BATCH_SIZE due rows, throttled by the global rate token, then
 * reschedule the next batch if work remains (or the token bucket was empty).
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

  const stats: DrainStats = { drained: 0, sent: 0, failed: 0, retried: 0, deferred: 0, unconfirmed: 0, reaped: 0, remaining: 0, rescheduled: false }
  let tokenExhausted = false
  // Earliest time a denied recipient may be retried; sets the next drain delay.
  let earliestRetryAt: number | null = null

  const nowIso = () => new Date().toISOString()

  // Recover abandoned 'sending' rows before claiming, so a reaped row can go out in this drain.
  stats.reaped = await reapStaleSends(supabase)

  for (let i = 0; i < BATCH_SIZE; i++) {
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
      let ctx: TemplateContext = { ...row.context, gymId: row.gym_id ?? row.context.gymId, dedupeKey: row.id, recipientCap: QUEUE_RECIPIENT_CAP }
      if (row.template_name === 'member_app_invitation') {
        const prep = await (deps.prepare ?? ((r) => defaultPrepare(supabase, r)))(row)
        if (prep.ok) ctx = { ...prep.context, gymId: ctx.gymId, dedupeKey: row.id, recipientCap: QUEUE_RECIPIENT_CAP }
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
      if (!persisted) console.error('[WA Queue] row left sending after successful send:', row.id)
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
    }
  }

  // Is there still work to do? (rows due now, or retries queued for later)
  const { count } = await supabase
    .from('whatsapp_send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  stats.remaining = count ?? 0

  if (stats.remaining > 0 || tokenExhausted) {
    // After a deferral nothing new can go out until a slot frees up, so wait for that, but
    // re-check at least hourly in case the limit was raised or slots freed early.
    const untilRetry = earliestRetryAt === null ? DRAIN_INTERVAL_MINUTES : Math.ceil((earliestRetryAt - Date.now()) / 60_000)
    const delay = earliestRetryAt === null ? DRAIN_INTERVAL_MINUTES : Math.min(60, Math.max(1, untilRetry))
    stats.rescheduled = await reschedule(delay)
  }

  return stats
}
