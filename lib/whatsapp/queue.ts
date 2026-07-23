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
import type { TemplateContext, TemplateId, SendResult } from '@/types/whatsapp'

// ─── Cadence constants ──────────────────────────────────────────────────────

/** Messages sent per drain batch. */
export const BATCH_SIZE = 5
/** Minutes between drain batches. */
export const DRAIN_INTERVAL_MINUTES = 5

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

  try {
    const res = await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(url), {
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
 *     transient, retries<max→ status='pending', scheduled_at += interval
 *     permanent OR retries exhausted → status='failed'; log reconciled
 */
export async function drainSendQueue(deps: DrainDeps): Promise<DrainStats> {
  const supabase = deps.supabase
  const sender = deps.sender ?? sendWhatsAppTemplate
  const takeToken = deps.takeToken ?? defaultTakeToken
  const reschedule = deps.reschedule ?? kickDrain

  const stats: DrainStats = { drained: 0, sent: 0, failed: 0, retried: 0, remaining: 0, rescheduled: false }
  let tokenExhausted = false

  const nowIso = () => new Date().toISOString()

  for (let i = 0; i < BATCH_SIZE; i++) {
    const token = await takeToken()
    if (!token.success) { tokenExhausted = true; break }

    // Claim the oldest due pending row atomically: flip to 'sending' guarded by
    // status='pending' so two concurrent drains can't grab the same row.
    const { data: candidate } = await supabase
      .from('whatsapp_send_queue')
      .select('id, template_name, context, log_row_id, attempts, max_attempts')
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
    try {
      result = await sender(row.template_name, row.context)
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    // Reconcile the pre-claimed automation-log row (message id / failure status).
    await finalizeSendRow(supabase, row.log_row_id, result)

    if (result.success) {
      await supabase
        .from('whatsapp_send_queue')
        .update({ status: 'sent', message_id: result.messageId ?? null, sent_at: nowIso(), last_error: null })
        .eq('id', row.id)
      stats.sent++
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
    stats.rescheduled = await reschedule(DRAIN_INTERVAL_MINUTES)
  }

  return stats
}
