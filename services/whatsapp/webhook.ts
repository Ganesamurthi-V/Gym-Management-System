/**
 * services/whatsapp/webhook.ts
 *
 * Service layer for parsing and dispatching incoming Meta webhook events.
 *
 * Responsibilities:
 *  1. Parse the raw payload into typed events (messages, statuses, contacts, errors)
 *  2. Deduplicate via Redis (idempotency)
 *  3. Dispatch each event type to its handler
 *  4. Persist to Supabase via the repository layer
 *
 * This service is called by the webhook route AFTER:
 *  - Signature verification ✓
 *  - Schema validation ✓
 *  - Immediate 200 response sent to Meta ✓
 *
 * All processing here is asynchronous and must not delay the HTTP response.
 */

import type {
  MetaWebhookPayload,
  InboundMessage,
  MessageStatus,
  ProcessedMessage,
  ProcessedStatus,
  MessageType,
} from '@/types/whatsapp'
import { checkAndMarkEvent } from '@/lib/whatsapp/idempotency'
import { logger } from '@/lib/logger'
import {
  saveIncomingMessage,
  messageExists,
  getGymIdFromPhoneNumber,
  updateMessageStatus,
  saveWebhookLog,
} from '@/repositories/whatsapp/whatsappRepository'

// ─── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Process a validated Meta webhook payload asynchronously.
 * Never throws — all errors are caught and logged individually.
 *
 * @param payload   - Validated webhook payload
 * @param requestId - Unique ID for this HTTP request (used in logs)
 * @param startMs   - Request start timestamp (for total latency logging)
 */
export async function processWebhookPayload(
  payload: MetaWebhookPayload,
  requestId: string,
  startMs: number,
): Promise<void> {
  const log = logger.child({ requestId, component: 'webhook_service' })

  const events = extractEvents(payload)
  log.info('Webhook events extracted', {
    messages: events.messages.length,
    statuses: events.statuses.length,
    phoneNumberId: events.phoneNumberId,
  })

  // Process all events concurrently — failures in one don't block others
  await Promise.allSettled([
    ...events.messages.map(msg =>
      handleInboundMessage(msg, events.phoneNumberId, events.contactNames, requestId)
        .catch(err => log.error('Failed to handle message', err)),
    ),
    ...events.statuses.map(status =>
      handleStatusUpdate(status, requestId)
        .catch(err => log.error('Failed to handle status', err)),
    ),
  ])

  const totalMs = Date.now() - startMs
  log.info('Webhook processing complete', {
    durationMs: totalMs,
    messages:   events.messages.length,
    statuses:   events.statuses.length,
  })

  // Persist webhook log (non-blocking, best-effort)
  saveWebhookLog(
    requestId,
    events.phoneNumberId,
    events.messages.length > 0 ? 'message' : events.statuses.length > 0 ? 'status' : 'unknown',
    payload as unknown as Record<string, unknown>,
    true,
    true,
    null,
    totalMs,
  ).catch(() => {}) // never fail the request over a log write
}

// ─── Event extraction ─────────────────────────────────────────────────────────

interface ExtractedEvents {
  messages:     InboundMessage[]
  statuses:     MessageStatus[]
  phoneNumberId: string
  contactNames: Record<string, string>
}

function extractEvents(payload: MetaWebhookPayload): ExtractedEvents {
  const messages:     InboundMessage[] = []
  const statuses:     MessageStatus[]  = []
  const contactNames: Record<string, string> = {}
  let phoneNumberId = 'unknown'

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue

      const value = change.value
      phoneNumberId = value.metadata.phone_number_id

      // Extract contact name lookup table (wa_id → display name)
      for (const contact of value.contacts ?? []) {
        contactNames[contact.wa_id] = contact.profile.name
      }

      for (const msg of value.messages ?? []) messages.push(msg)
      for (const st  of value.statuses ?? []) statuses.push(st)
    }
  }

  return { messages, statuses, phoneNumberId, contactNames }
}

// ─── Inbound message handler ──────────────────────────────────────────────────

async function handleInboundMessage(
  msg: InboundMessage,
  phoneNumberId: string,
  contactNames: Record<string, string>,
  requestId: string,
): Promise<void> {
  const log = logger.child({ requestId, messageId: msg.id, component: 'inbound_message' })

  // 1. Redis idempotency — fast path
  const isNew = await checkAndMarkEvent(msg.id, 'message')
  if (!isNew) {
    log.debug('Duplicate message (Redis), skipping')
    return
  }

  // 2. DB idempotency — fallback for Redis misses
  if (await messageExists(msg.id)) {
    log.debug('Duplicate message (DB), skipping')
    return
  }

  // 3. Resolve gym from the business phone number that received the message
  const gymId = await getGymIdFromPhoneNumber(phoneNumberId)
  if (!gymId) {
    // Phone not mapped to any gym — still log so we can diagnose
    log.warn('No gym mapped to phone number ID', { phoneNumberId })
    return
  }

  // 4. Normalise to internal type
  const processed = normaliseMessage(msg, phoneNumberId)

  // 5. Persist
  await saveIncomingMessage(processed, gymId, contactNames[msg.from])

  log.info('Inbound message saved', { type: msg.type, gymId })
}

// ─── Status update handler ────────────────────────────────────────────────────

async function handleStatusUpdate(
  status: MessageStatus,
  requestId: string,
): Promise<void> {
  const log = logger.child({ requestId, messageId: status.id, component: 'status_update' })

  // Composite key: same message can transition through multiple statuses
  const idempKey = `${status.id}:${status.status}`
  const isNew    = await checkAndMarkEvent(idempKey, 'status')
  if (!isNew) {
    log.debug('Duplicate status (Redis), skipping', { status: status.status })
    return
  }

  const processed: ProcessedStatus = {
    messageId:      status.id,
    status:         status.status,
    recipientId:    status.recipient_id,
    timestamp:      new Date(parseInt(status.timestamp, 10) * 1000),
    conversationId: status.conversation?.id,
    errorCode:      status.errors?.[0]?.code,
    errorMessage:   status.errors?.[0]?.title,
  }

  await updateMessageStatus(processed)

  log.info('Status updated', { status: status.status })
}

// ─── Normaliser ───────────────────────────────────────────────────────────────

function normaliseMessage(msg: InboundMessage, toPhoneId: string): ProcessedMessage {
  const type = normaliseType(msg.type)

  const processed: ProcessedMessage = {
    messageId:        msg.id,
    from:             msg.from,
    to:               toPhoneId,
    timestamp:        new Date(parseInt(msg.timestamp, 10) * 1000),
    type,
    contextMessageId: msg.context?.id,
    metadata:         {},
  }

  switch (type) {
    case 'text':
      processed.text = msg.text?.body
      break
    case 'image': case 'video': case 'audio': case 'sticker':
      processed.mediaId   = (msg[type as keyof InboundMessage] as any)?.id
      processed.mediaType = (msg[type as keyof InboundMessage] as any)?.mime_type
      processed.caption   = (msg[type as keyof InboundMessage] as any)?.caption
      break
    case 'document':
      processed.mediaId   = msg.document?.id
      processed.mediaType = msg.document?.mime_type
      processed.caption   = msg.document?.caption
      break
    case 'location':
      processed.location = msg.location
      break
    case 'interactive':
      if (msg.interactive?.button_reply) {
        processed.interactiveResponse = {
          type:  'button',
          id:    msg.interactive.button_reply.id,
          title: msg.interactive.button_reply.title,
        }
      } else if (msg.interactive?.list_reply) {
        processed.interactiveResponse = {
          type:  'list',
          id:    msg.interactive.list_reply.id,
          title: msg.interactive.list_reply.title,
        }
      }
      break
    case 'button':
      processed.text = msg.button?.text
      break
    case 'reaction':
      processed.text = msg.reaction?.emoji
      break
  }

  return processed
}

const KNOWN_TYPES = new Set<MessageType>([
  'text','image','video','audio','document','sticker',
  'location','contacts','interactive','button','order',
  'system','reaction',
])

function normaliseType(type: string): MessageType {
  return KNOWN_TYPES.has(type as MessageType) ? (type as MessageType) : 'unknown'
}
