/**
 * WhatsApp Message Processor
 * 
 * Handles incoming WhatsApp messages.
 * Validates, stores, and queues messages for business logic processing.
 */

import type { ProcessedMessage } from '@/lib/whatsapp/webhookTypes'
import { checkAndMarkEvent } from '@/lib/whatsapp/idempotency'
import {
  saveIncomingMessage,
  messageExists,
  getGymIdFromPhoneNumber,
} from '@/repositories/whatsapp/whatsappRepository'
import { RequestLogger } from '@/lib/logger'
import * as Sentry from '@sentry/nextjs'

/**
 * Process incoming WhatsApp messages
 * 
 * Flow:
 * 1. Check idempotency (Redis)
 * 2. Check database for duplicates
 * 3. Resolve gym from phone number
 * 4. Save to database
 * 5. Queue for business logic processing
 * 
 * @param messages - Parsed messages from webhook
 * @param contactNames - Contact name lookup by phone number
 * @param log - Request logger
 */
export async function processMessages(
  messages: ProcessedMessage[],
  contactNames: Record<string, string>,
  log: RequestLogger
): Promise<void> {
  log.start('PROCESS_MESSAGES')

  const results = {
    processed: 0,
    duplicate: 0,
    failed: 0,
  }

  for (const message of messages) {
    try {
      await processSingleMessage(message, contactNames, log)
      results.processed++
    } catch (error) {
      results.failed++
      log.error(`Failed to process message ${message.messageId}`, error)
      
      // Report to Sentry but don't throw
      Sentry.captureException(error, {
        tags: {
          component: 'whatsapp_message_processor',
          message_id: message.messageId,
        },
        extra: {
          message,
        },
      })
    }
  }

  log.end('PROCESS_MESSAGES')
  log.info('Message processing complete', results)
}

/**
 * Process a single message
 */
async function processSingleMessage(
  message: ProcessedMessage,
  contactNames: Record<string, string>,
  log: RequestLogger
): Promise<void> {
  // 1. Idempotency check (Redis)
  const isNew = await checkAndMarkEvent(message.messageId, 'message')
  
  if (!isNew) {
    log.info('Duplicate message detected (Redis)', {
      messageId: message.messageId,
    })
    return
  }

  // 2. Database duplicate check (in case Redis was down)
  const exists = await messageExists(message.messageId)
  
  if (exists) {
    log.info('Duplicate message detected (Database)', {
      messageId: message.messageId,
    })
    return
  }

  // 3. Resolve gym from phone number
  const gymId = await getGymIdFromPhoneNumber(message.to)
  
  if (!gymId) {
    log.warn('No gym found for phone number', {
      phoneNumberId: message.to,
      messageId: message.messageId,
    })
    
    // Still save the message for debugging, use a fallback gym ID
    // or create a separate table for unrouted messages
    throw new Error(`No gym configured for phone number ${message.to}`)
  }

  // 4. Save to database
  const contactName = contactNames[message.from]
  await saveIncomingMessage(message, gymId, contactName)

  log.info('Message saved', {
    messageId: message.messageId,
    type: message.type,
    from: message.from,
    gymId,
  })

  // 5. Queue for business logic processing
  // This is where you'd trigger your custom business logic:
  // - Auto-replies
  // - Member lookup
  // - Appointment booking
  // - Notifications to staff
  // etc.
  await queueMessageForProcessing(message, gymId, log)
}

/**
 * Queue message for asynchronous business logic processing
 * 
 * In production, this would:
 * - Send to a message queue (SQS, RabbitMQ, etc.)
 * - Trigger a background job
 * - Call a webhook
 * - etc.
 * 
 * For now, we'll just log it and implement the hook later.
 */
async function queueMessageForProcessing(
  message: ProcessedMessage,
  gymId: string,
  log: RequestLogger
): Promise<void> {
  // TODO: Implement your business logic here
  // Examples:
  // - await sendToQueue({ messageId: message.messageId, gymId })
  // - await triggerBackgroundJob({ messageId: message.messageId })
  // - await notifyStaff({ message, gymId })
  
  log.info('Message queued for processing', {
    messageId: message.messageId,
    gymId,
    type: message.type,
  })

  // Placeholder for future implementation
  // For now, messages are saved to DB and can be processed by a separate worker
}

/**
 * Handle specific message types with custom logic
 */
export async function handleMessageByType(
  message: ProcessedMessage,
  gymId: string
): Promise<void> {
  switch (message.type) {
    case 'text':
      await handleTextMessage(message, gymId)
      break
    
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      await handleMediaMessage(message, gymId)
      break
    
    case 'location':
      await handleLocationMessage(message, gymId)
      break
    
    case 'interactive':
      await handleInteractiveMessage(message, gymId)
      break
    
    default:
      // Unknown or unsupported message type
      console.log('Unhandled message type:', message.type)
  }
}

async function handleTextMessage(message: ProcessedMessage, gymId: string): Promise<void> {
  // TODO: Implement text message handling
  // - Parse commands
  // - Trigger auto-replies
  // - Member lookup
  // etc.
}

async function handleMediaMessage(message: ProcessedMessage, gymId: string): Promise<void> {
  // TODO: Implement media message handling
  // - Download media from WhatsApp
  // - Store in your storage (S3, Supabase Storage, etc.)
  // - Update database with media URL
}

async function handleLocationMessage(message: ProcessedMessage, gymId: string): Promise<void> {
  // TODO: Implement location message handling
  // - Save location to member profile
  // - Trigger location-based features
}

async function handleInteractiveMessage(message: ProcessedMessage, gymId: string): Promise<void> {
  // TODO: Implement interactive message handling
  // - Handle button clicks
  // - Handle list selections
  // - Update conversation state
}
