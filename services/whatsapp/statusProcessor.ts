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
import * as Sentry from '@sentry/nextjs'

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

  // TODO: Implement failed message handling
  // - Alert gym staff
  // - Retry logic
  // - Update member communication preferences
  // - Log to monitoring system
  
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
