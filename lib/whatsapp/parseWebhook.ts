/**
 * WhatsApp Webhook Parser
 * 
 * Extracts and normalizes data from Meta's webhook payloads.
 * Handles all message types and status updates.
 */

import type {
  MetaWebhookPayload,
  ProcessedMessage,
  ProcessedStatus,
  Message,
  Status,
  MessageType,
} from './webhookTypes'

/**
 * Parse incoming messages from webhook payload
 */
export function parseMessages(payload: MetaWebhookPayload): ProcessedMessage[] {
  const messages: ProcessedMessage[] = []

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value
      
      if (!value.messages || value.messages.length === 0) {
        continue
      }

      for (const message of value.messages) {
        try {
          const processed = parseMessage(message, value.metadata.phone_number_id)
          messages.push(processed)
        } catch (error) {
          console.error('Failed to parse message:', message.id, error)
          // Continue processing other messages
        }
      }
    }
  }

  return messages
}

/**
 * Parse incoming statuses from webhook payload
 */
export function parseStatuses(payload: MetaWebhookPayload): ProcessedStatus[] {
  const statuses: ProcessedStatus[] = []

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value
      
      if (!value.statuses || value.statuses.length === 0) {
        continue
      }

      for (const status of value.statuses) {
        try {
          const processed = parseStatus(status)
          statuses.push(processed)
        } catch (error) {
          console.error('Failed to parse status:', status.id, error)
          // Continue processing other statuses
        }
      }
    }
  }

  return statuses
}

/**
 * Parse a single message into normalized format
 */
function parseMessage(message: Message, phoneNumberId: string): ProcessedMessage {
  const messageType = normalizeMessageType(message.type)
  
  const processed: ProcessedMessage = {
    messageId: message.id,
    from: message.from,
    to: phoneNumberId,
    timestamp: new Date(parseInt(message.timestamp) * 1000),
    type: messageType,
    contextMessageId: message.context?.id,
    metadata: {},
  }

  // Extract content based on message type
  switch (messageType) {
    case 'text':
      processed.text = message.text?.body
      break

    case 'image':
      processed.mediaId = message.image?.id
      processed.mediaType = message.image?.mime_type
      processed.caption = message.image?.caption
      break

    case 'video':
      processed.mediaId = message.video?.id
      processed.mediaType = message.video?.mime_type
      processed.caption = message.video?.caption
      break

    case 'audio':
      processed.mediaId = message.audio?.id
      processed.mediaType = message.audio?.mime_type
      break

    case 'document':
      processed.mediaId = message.document?.id
      processed.mediaType = message.document?.mime_type
      processed.caption = message.document?.caption
      processed.metadata.filename = message.document?.filename
      break

    case 'sticker':
      processed.mediaId = message.sticker?.id
      processed.mediaType = message.sticker?.mime_type
      break

    case 'location':
      processed.location = {
        latitude: message.location?.latitude ?? 0,
        longitude: message.location?.longitude ?? 0,
        name: message.location?.name,
        address: message.location?.address,
      }
      break

    case 'contacts':
      processed.metadata.contacts = message.contacts
      break

    case 'interactive':
      if (message.interactive?.button_reply) {
        processed.interactiveResponse = {
          type: 'button',
          id: message.interactive.button_reply.id,
          title: message.interactive.button_reply.title,
        }
      } else if (message.interactive?.list_reply) {
        processed.interactiveResponse = {
          type: 'list',
          id: message.interactive.list_reply.id,
          title: message.interactive.list_reply.title,
        }
      }
      break

    case 'button':
      processed.text = message.button?.text
      processed.metadata.payload = message.button?.payload
      break

    case 'order':
      processed.metadata.order = message.order
      break

    case 'system':
      processed.text = message.system?.body
      processed.metadata.systemType = message.system?.type
      break

    case 'reaction':
      processed.text = message.reaction?.emoji
      processed.metadata.reactionToMessageId = message.reaction?.message_id
      break

    default:
      // Unknown message type - store raw data
      processed.metadata.rawMessage = message
  }

  // Add contact info if available
  if (message.context) {
    processed.metadata.context = {
      from: message.context.from,
      forwarded: message.context.forwarded,
      frequently_forwarded: message.context.frequently_forwarded,
    }
  }

  // Add error info if present
  if (message.errors && message.errors.length > 0) {
    processed.metadata.errors = message.errors
  }

  return processed
}

/**
 * Parse a single status update into normalized format
 */
function parseStatus(status: Status): ProcessedStatus {
  const processed: ProcessedStatus = {
    messageId: status.id,
    status: status.status,
    recipientId: status.recipient_id,
    timestamp: new Date(parseInt(status.timestamp) * 1000),
    conversationId: status.conversation?.id,
  }

  // Add error info if present
  if (status.errors && status.errors.length > 0) {
    const error = status.errors[0] // Take first error
    processed.errorCode = error.code
    processed.errorMessage = error.title
  }

  return processed
}

/**
 * Normalize message type to known types
 */
function normalizeMessageType(type: string): MessageType {
  const knownTypes: MessageType[] = [
    'text',
    'image',
    'video',
    'audio',
    'document',
    'sticker',
    'location',
    'contacts',
    'interactive',
    'button',
    'order',
    'system',
    'reaction',
  ]

  if (knownTypes.includes(type as MessageType)) {
    return type as MessageType
  }

  return 'unknown'
}

/**
 * Extract contact name from webhook payload
 */
export function extractContactName(payload: MetaWebhookPayload): Record<string, string> {
  const contacts: Record<string, string> = {}

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value
      
      if (value.contacts) {
        for (const contact of value.contacts) {
          contacts[contact.wa_id] = contact.profile.name
        }
      }
    }
  }

  return contacts
}
