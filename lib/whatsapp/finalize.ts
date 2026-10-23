/**
 * lib/whatsapp/finalize.ts
 *
 * Shared reconciliation logic for a claimed whatsapp_automation_logs row.
 *
 * A send is "claimed" (row inserted with status='sent') BEFORE dispatch, then
 * reconciled with the real result afterwards. This lives in its own module so
 * both the inline automation path (automation.ts) and the throttled queue drain
 * (queue.ts) can share it without a circular import.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SendResult } from '@/types/whatsapp'

/**
 * Is a failed send transient/systemic (a later retry could succeed) rather than
 * permanent? A permanent failure is a real Meta 4xx (bad number, rejected or
 * paused template, blocked business) — retrying will not help, so it consumes a
 * cycle slot. Everything else is transient: a thrown exception (network error,
 * timeout, missing/rotated token → no httpStatus) or a 429/5xx that exhausted
 * fetch.ts's retries.
 */
export function isTransientFailure(result: SendResult): boolean {
  const s = result.httpStatus
  if (s === undefined) return true       // network / timeout / config exception
  return s === 429 || s >= 500           // rate-limit or upstream — retryable
}

/**
 * Reconcile a claimed slot with the actual send result.
 *   success            → keep 'sent', attach the Meta message_id
 *   permanent 4xx      → downgrade to 'failed' (keeps the slot consumed)
 *   ambiguous (timeout / network / 5xx: Meta may have accepted it)
 *                      → keep 'sent' so the slot stays consumed and the next run cannot
 *                        resend; only annotate error_message ('unconfirmed: ...')
 *   transient/systemic → downgrade to 'error' (releases the slot; getCycleState
 *                        and resolveDueCycleKey ignore it, so the next run retries)
 *   skipped (gym switch off) → also 'error', for the same reason
 *   deferred (24 h recipient limit) → also 'error', so a later run retries
 */
export async function finalizeSendRow(
  supabase: SupabaseClient,
  rowId: string | null,
  result: SendResult,
): Promise<void> {
  if (!rowId) return

  const update: Record<string, unknown> = result.success
    ? { message_id: result.messageId ?? null }
    : result.skipped
    // Switched off on purpose (the gym's WhatsApp switch): nothing was sent. Recorded as
    // 'error' and NOT 'cancelled': 'error' releases the reminder slot, so when WhatsApp is
    // switched back on the next run sends the reminder. 'cancelled' would close the cycle
    // for good (it means "the due was paid") and the member would never be reminded.
    ? { status: 'error', error_message: result.error ?? null }
    : result.deferred
    // Meta's 24 h unique-recipient limit: nothing was sent. Same reasoning as skipped: release
    // the slot ('error') so a later run retries instead of closing the cycle.
    ? { status: 'error', error_message: 'daily recipient limit' }
    : result.ambiguous
    // Outcome unknown: releasing the slot would let the next cron run resend a message Meta
    // may already have delivered. The queue's webhook / lease path resolves the real outcome.
    ? { error_message: `unconfirmed: ${result.error ?? 'unknown'}` }
    : {
        status: isTransientFailure(result) ? 'error' : 'failed',
        error_message: result.error ?? null,
      }

  const { error } = await supabase
    .from('whatsapp_automation_logs')
    .update(update)
    .eq('id', rowId)

  if (error) console.error('[WA] finalize update failed:', error.message)
}
