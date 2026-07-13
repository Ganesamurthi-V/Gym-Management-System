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
 *   transient/systemic → downgrade to 'error' (releases the slot; getCycleState
 *                        and resolveDueCycleKey ignore it, so the next run retries)
 */
export async function finalizeSendRow(
  supabase: SupabaseClient,
  rowId: string | null,
  result: SendResult,
): Promise<void> {
  if (!rowId) return

  const update: Record<string, unknown> = result.success
    ? { message_id: result.messageId ?? null }
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
