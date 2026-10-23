import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

/**
 * Meta's cap on UNIQUE customers messaged per rolling 24 h by our one shared WhatsApp number.
 *
 * The limit is global (every gym shares the number) and a customer counts once however many
 * messages they get; they leave the count 24 h after their FIRST message in the window. The
 * bookkeeping lives in whatsapp_recipient_window, guarded by reserve_whatsapp_recipient()
 * (serialised by an advisory lock, so two senders cannot both take the last slot).
 * Exceeding it blocks messaging and hurts the number's quality, so every failure here is
 * treated as "do not send".
 */

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/** Raise via WHATSAPP_DAILY_RECIPIENT_LIMIT when Meta moves the number to a higher tier. */
export const DAILY_RECIPIENT_LIMIT = positiveInt(process.env.WHATSAPP_DAILY_RECIPIENT_LIMIT, 250)

/**
 * Slots kept back from the queue. Signup OTPs and inline welcome / renewal messages are
 * time-sensitive, so bulk queue work must never use the last slots of the day.
 */
export const QUEUE_RECIPIENT_RESERVE = Math.min(
  positiveInt(process.env.WHATSAPP_QUEUE_RECIPIENT_RESERVE, 30),
  DAILY_RECIPIENT_LIMIT - 1,
)

/** Recipient cap the throttled queue is allowed to fill. */
export const QUEUE_RECIPIENT_CAP = DAILY_RECIPIENT_LIMIT - QUEUE_RECIPIENT_RESERVE

/** How long a caller is told to wait when the limit cannot be checked at all. */
const FAIL_CLOSED_RETRY_MS = 2 * 60_000

/**
 * 91XXXXXXXXXX form used for Meta's `to` and as the window key. The Indian subscriber number
 * is the last 10 digits; guarding on startsWith('91') would leave a valid 10-digit mobile that
 * itself starts with "91" without a country code. Idempotent for numbers already in this form.
 */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 10) return `91${digits.slice(-10)}`
  return digits
}

export type ReserveResult =
  | { allowed: true; isNew: boolean }
  | { allowed: false; retryAt: Date }

async function db(client?: SupabaseClient): Promise<SupabaseClient> {
  // Lazy for the same reason as gymGate: the admin client is server-only and must not be
  // pulled in by every module (and test) that merely imports the sender.
  return client ?? (await import('@/lib/supabase/admin')).createAdminClient()
}

/** Take (or confirm) a slot for this recipient. Fails closed on any error. */
export async function reserveRecipient(
  phone: string,
  opts: { cap?: number; client?: SupabaseClient } = {},
): Promise<ReserveResult> {
  try {
    const { data, error } = await (await db(opts.client)).rpc('reserve_whatsapp_recipient', {
      p_phone: normalisePhone(phone),
      p_limit: opts.cap ?? DAILY_RECIPIENT_LIMIT,
    })
    if (error) throw error
    const r = data as { allowed?: boolean; is_new?: boolean; retry_at?: string } | null
    if (r?.allowed === true) return { allowed: true, isNew: r.is_new === true }
    if (r?.allowed === false && r.retry_at) {
      const retryAt = new Date(r.retry_at)
      if (!Number.isNaN(retryAt.getTime())) return { allowed: false, retryAt }
    }
    throw new Error('unexpected reserve_whatsapp_recipient result')
  } catch (err) {
    logger.error('recipientLimit: could not reserve a recipient slot; not sending', err)
    return { allowed: false, retryAt: new Date(Date.now() + FAIL_CLOSED_RETRY_MS) }
  }
}

/**
 * Give back a slot this attempt created because Meta definitely rejected the send. Best effort:
 * a failed release only wastes a slot until it expires, it never allows an over-limit send.
 */
export async function releaseRecipient(phone: string, client?: SupabaseClient): Promise<void> {
  try {
    const { error } = await (await db(client)).rpc('release_whatsapp_recipient', { p_phone: normalisePhone(phone) })
    if (error) throw error
  } catch (err) {
    logger.error('recipientLimit: could not release a recipient slot', err)
  }
}

/** Current window usage for monitoring and estimates; null when it cannot be read. */
export async function getRecipientWindowUsage(
  client?: SupabaseClient,
): Promise<{ inWindow: number; oldest: string | null } | null> {
  try {
    const { data, error } = await (await db(client)).rpc('whatsapp_recipient_window_usage')
    if (error) throw error
    const u = data as { in_window?: number; oldest?: string | null } | null
    if (typeof u?.in_window !== 'number') return null
    return { inWindow: u.in_window, oldest: u.oldest ?? null }
  } catch (err) {
    logger.error('recipientLimit: could not read window usage', err)
    return null
  }
}

/**
 * Minutes until a queue of `queued` messages to `unique` distinct phones is done.
 * Rate-based part: one batch per interval. If more unique phones are queued than slots are
 * free, each further `cap` phones waits roughly a day. Approximate on purpose: slots free up
 * continuously as old recipients age out, so this errs towards a whole number of days.
 */
export function estimateDrainMinutes(p: {
  queued: number
  unique: number
  free: number
  cap: number
  batchSize: number
  intervalMinutes: number
}): number {
  const rate = Math.ceil(p.queued / p.batchSize) * p.intervalMinutes
  const over = p.unique - Math.max(0, p.free)
  if (over <= 0 || p.cap <= 0) return rate
  return rate + Math.ceil(over / p.cap) * 1440
}
