/**
 * WhatsApp Status Processor
 * 
 * Handles message status updates from WhatsApp.
 * Updates message delivery status in database.
 */

import type { ProcessedStatus } from '@/lib/whatsapp/webhookTypes'
import { checkAndMarkEvent } from '@/lib/whatsapp/idempotency'
import { updateMessageStatus } from '@/repositories/whatsapp/whatsappRepository'
import { RequestLogger } from '@/lib/logger'
import { confirmQueuedSend } from '@/lib/whatsapp/queue'
import { createAdminClient } from '@/lib/supabase/admin'
import * as Sentry from '@sentry/nextjs'
import { reportAlertInBackground } from '@/lib/monitoring/alert'

/**
 * Increment a Redis counter with a TTL. Returns null (never throws) when Redis is unconfigured or
 * errors: an alert counter must never break request handling. Uses the exported client only when
 * both env vars are set, so dev setups do not log "Redis credentials missing" warnings.
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

/** yyyyMMddHH in UTC, the bucket for hourly alert counters. */
function hourBucket(): string {
  return new Date().toISOString().slice(0, 13).replace(/[-T]/g, '')
}

/** Delivery failures per UTC hour at which the rate alert fires. */
export const DELIVERY_FAILURE_RATE_THRESHOLD = 10

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Meta error classes that need action. Everything else is a per-recipient problem or unknown. */
export function classifyMetaError(code: number | undefined, message: string | undefined):
  'token' | 'recipient' | 'rate_limit' | 'other' {
  if (code === 190 || code === 401 || /oauth|access token/i.test(message ?? '')) return 'token'
  // 131056 is a per-recipient pair rate limit, not a global throttle.
  if (code === 131030 || code === 131026 || code === 131056) return 'recipient'
  if (code === 131048 || code === 130429) return 'rate_limit'
  return 'other'
}

/**
 * Process WhatsApp status updates
 * 
 * Flow:
 * 1. Check idempotency (Redis)
 * 2. Update message status in database
 * 3. Trigger status-specific actions
 * 
 * @param statuses - Parsed status updates from webhook
 * @param log - Request logger
 */
export async function processStatuses(
  statuses: ProcessedStatus[],
  log: RequestLogger
): Promise<void> {
  log.start('PROCESS_STATUSES')

  const results = {
    processed: 0,
    duplicate: 0,
    failed: 0,
  }

  for (const status of statuses) {
    try {
      await processSingleStatus(status, log)
      results.processed++
    } catch (error) {
      results.failed++
      log.error(`Failed to process status ${status.messageId}`, error)
      
      // Report to Sentry but don't throw
      Sentry.captureException(error, {
        tags: {
          component: 'whatsapp_status_processor',
          message_id: status.messageId,
          status: status.status,
        },
        extra: {
          status,
        },
      })
    }
  }

  log.end('PROCESS_STATUSES')
  log.info('Status processing complete', results)
}

/**
 * Process a single status update
 */
async function processSingleStatus(
  status: ProcessedStatus,
  log: RequestLogger
): Promise<void> {
  // Confirm before the duplicate check: it is idempotent, and a redelivered event must still
  // be able to confirm if the first attempt's database write failed.
  await confirmQueuedFromStatus(status, log)

  // 1. Idempotency check (Redis)
  // Use a composite key for statuses since same message can have multiple statuses
  const idempotencyKey = `${status.messageId}:${status.status}`
  const isNew = await checkAndMarkEvent(idempotencyKey, 'status')
  
  if (!isNew) {
    log.info('Duplicate status detected', {
      messageId: status.messageId,
      status: status.status,
    })
    return
  }

  // 2. Update database
  await updateMessageStatus(status)

  log.info('Status updated', {
    messageId: status.messageId,
    status: status.status,
    recipientId: status.recipientId,
    conversationId: status.conversationId,
  })

  // 3. Trigger status-specific actions
  await handleStatusUpdate(status, log)
}

/**
 * Meta echoes biz_opaque_callback_data (the send-queue row id) on status webhooks. A sent /
 * delivered / read status proves Meta accepted that send, so the queue row is marked sent and
 * the lease reaper never resends it. 'failed' must not confirm. Never throws.
 */
export async function confirmQueuedFromStatus(
  status: ProcessedStatus,
  log: RequestLogger
): Promise<void> {
  if (!status.bizOpaqueData) return
  if (status.status !== 'sent' && status.status !== 'delivered' && status.status !== 'read') return

  try {
    const res = await confirmQueuedSend(createAdminClient(), status.bizOpaqueData, status.messageId)
    log.info('Queued send confirmation', { messageId: status.messageId, updated: res.updated })
  } catch (error) {
    log.error(`Failed to confirm queued send for ${status.messageId}`, error)
  }
}

/**
 * Handle status-specific actions
 */
async function handleStatusUpdate(
  status: ProcessedStatus,
  log: RequestLogger
): Promise<void> {
  switch (status.status) {
    case 'failed':
      await handleFailedStatus(status, log)
      break
    
    case 'read':
      await handleReadStatus(status, log)
      break
    
    case 'delivered':
      await handleDeliveredStatus(status, log)
      break
    
    case 'sent':
      await handleSentStatus(status, log)
      break
    
    case 'deleted':
      await handleDeletedStatus(status, log)
      break
    
    default:
      log.warn('Unknown status type', { status: status.status })
  }
}

/**
 * Handle failed message delivery
 */
async function handleFailedStatus(
  status: ProcessedStatus,
  log: RequestLogger
): Promise<void> {
  log.warn('Message delivery failed', {
    messageId: status.messageId,
    errorCode: status.errorCode,
    errorMessage: status.errorMessage,
  })

  const reason = `Meta ${status.errorCode ?? 'unknown'}: ${status.errorMessage ?? 'delivery failed'}`.slice(0, 300)

  // Record the real outcome. 'delivery_failed' is counted like 'failed' by the reminder cycle
  // logic, so the cron never re-queues the same reminder to the same dead number. Best effort:
  // the alerts below must still fire if the write fails.
  try {
    const supabase = createAdminClient()
    const bizId = status.bizOpaqueData
    const queueQuery = supabase
      .from('whatsapp_send_queue')
      .update({ status: 'delivery_failed', last_error: reason })
      .in('status', ['sent', 'sending'])
    // By row id, but only if the row's message_id is this status's message (or still unset):
    // a late 'failed' for an EARLIER attempt must not flip a row whose retry has a newer message.
    await (bizId && UUID_RE.test(bizId)
      ? queueQuery.eq('id', bizId).or(`message_id.is.null,message_id.eq."${status.messageId}"`)
      : queueQuery.eq('message_id', status.messageId))
    await supabase
      .from('whatsapp_automation_logs')
      .update({ status: 'delivery_failed', error_message: reason })
      .eq('message_id', status.messageId)
      .eq('status', 'sent')
  } catch (error) {
    log.error(`Failed to persist delivery failure for ${status.messageId}`, error)
  }

  // Report to Sentry for monitoring
  Sentry.captureMessage('WhatsApp message delivery failed', {
    level: 'warning',
    tags: {
      message_id: status.messageId,
      error_code: status.errorCode?.toString(),
    },
    extra: {
      status,
    },
  })

  // Alerts. Never include the recipient number.
  const kind = classifyMetaError(status.errorCode, status.errorMessage)
  if (kind === 'token') {
    reportAlertInBackground({ key: 'wa:token_invalid', severity: 'critical', title: 'WhatsApp access token invalid or expired: renew it',
      body: `Meta reported ${reason}` })
  } else if (kind === 'rate_limit') {
    reportAlertInBackground({ key: 'wa:meta_rate_limited', severity: 'critical', title: 'WhatsApp rate limited by Meta',
      body: `Meta reported ${reason}` })
  } else if (kind === 'other') {
    reportAlertInBackground({ key: 'wa:delivery_failed', severity: 'warning', title: 'WhatsApp delivery failed',
      body: `Meta error code ${status.errorCode ?? 'unknown'}: ${status.errorMessage ?? 'no detail'}` })
  }
  // 'recipient' (131030 / 131026: not on WhatsApp / undeliverable) is a normal user-level failure:
  // never alerted individually, only counted toward the hourly rate.

  // Fire-and-forget: Meta expects a fast 200 from the webhook, so no Redis round trip is awaited.
  void bumpCounter(`wa:delivery_failures:${hourBucket()}`, 7200).then(perHour => {
  if (perHour === DELIVERY_FAILURE_RATE_THRESHOLD) {
    reportAlertInBackground({ key: 'wa:delivery_failure_rate', severity: 'warning', title: 'WhatsApp delivery failures spiking',
      body: `${DELIVERY_FAILURE_RATE_THRESHOLD}+ delivery failures reported by Meta this hour.` })
  }
  }).catch(() => {})
}

/**
 * Handle message read receipt
 */
async function handleReadStatus(
  status: ProcessedStatus,
  log: RequestLogger
): Promise<void> {
  // TODO: Implement read receipt handling
  // - Update UI to show message was read
  // - Track engagement metrics
  // - Trigger follow-up actions
  
  log.info('Message read', {
    messageId: status.messageId,
    recipientId: status.recipientId,
  })
}

/**
 * Handle message delivered confirmation
 */
async function handleDeliveredStatus(
  status: ProcessedStatus,
  log: RequestLogger
): Promise<void> {
  // TODO: Implement delivered status handling
  // - Update UI
  // - Track delivery metrics
  
  log.info('Message delivered', {
    messageId: status.messageId,
    recipientId: status.recipientId,
  })
}

/**
 * Handle message sent confirmation
 */
async function handleSentStatus(
  status: ProcessedStatus,
  log: RequestLogger
): Promise<void> {
  // TODO: Implement sent status handling
  // - Update UI
  // - Track sending metrics
  
  log.info('Message sent', {
    messageId: status.messageId,
    recipientId: status.recipientId,
  })
}

/**
 * Handle message deletion
 */
async function handleDeletedStatus(
  status: ProcessedStatus,
  log: RequestLogger
): Promise<void> {
  // TODO: Implement deletion handling
  // - Mark message as deleted in UI
  // - Update conversation history
  
  log.info('Message deleted', {
    messageId: status.messageId,
    recipientId: status.recipientId,
  })
}

/**
 * Get status statistics for monitoring
 */
export async function getStatusStatistics(
  timeRangeMinutes: number = 60
): Promise<Record<string, number>> {
  // TODO: Implement statistics gathering
  // Query database for status counts in time range
  // Return counts by status type
  
  return {
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    deleted: 0,
  }
}
