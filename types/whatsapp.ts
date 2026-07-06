/**
 * types/whatsapp.ts
 *
 * Canonical TypeScript definitions for the WhatsApp Cloud API.
 * Used by every layer: proxy, webhook, services, repository.
 *
 * Covers:
 *  - Meta webhook payload structure (inbound events)
 *  - Template sending (outbound)
 *  - Internal processed types
 *  - Database record shapes
 *  - Typed error classes
 */

// ─────────────────────────────────────────────────────────────────────────────
// Webhook — Meta inbound payload
// ─────────────────────────────────────────────────────────────────────────────

export interface MetaWebhookPayload {
  object: 'whatsapp_business_account'
  entry: WebhookEntry[]
}

export interface WebhookEntry {
  /** WhatsApp Business Account ID */
  id: string
  changes: WebhookChange[]
}

export interface WebhookChange {
  value: WebhookValue
  field: string
}

export interface WebhookValue {
  messaging_product: 'whatsapp'
  metadata: WebhookMetadata
  contacts?: WebhookContact[]
  messages?: InboundMessage[]
  statuses?: MessageStatus[]
  errors?: ApiError[]
}

export interface WebhookMetadata {
  display_phone_number: string
  phone_number_id: string
}

export interface WebhookContact {
  profile: { name: string }
  wa_id: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbound messages
// ─────────────────────────────────────────────────────────────────────────────

export type MessageType =
  | 'text' | 'image' | 'video' | 'audio' | 'document'
  | 'sticker' | 'location' | 'contacts' | 'interactive'
  | 'button' | 'order' | 'system' | 'reaction' | 'unknown'

export interface InboundMessage {
  id: string
  from: string
  timestamp: string   // unix epoch string
  type: MessageType
  context?: { from: string; id: string; forwarded?: boolean }
  text?: { body: string }
  image?: MediaObject
  video?: MediaObject
  audio?: MediaObject
  document?: MediaObject & { filename?: string }
  sticker?: MediaObject
  location?: LocationObject
  contacts?: ContactObject[]
  interactive?: InteractiveObject
  button?: { text: string; payload: string }
  reaction?: { message_id: string; emoji: string }
  system?: { body: string; type: string }
  errors?: ApiError[]
}

export interface MediaObject {
  id?: string
  mime_type?: string
  sha256?: string
  caption?: string
}

export interface LocationObject {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface ContactObject {
  name: { formatted_name: string }
  phones?: Array<{ phone: string; type?: string }>
  emails?: Array<{ email: string; type?: string }>
}

export interface InteractiveObject {
  type: 'button_reply' | 'list_reply'
  button_reply?: { id: string; title: string }
  list_reply?: { id: string; title: string; description?: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message status updates
// ─────────────────────────────────────────────────────────────────────────────

export type StatusType = 'sent' | 'delivered' | 'read' | 'failed' | 'deleted'

export interface MessageStatus {
  id: string
  status: StatusType
  timestamp: string
  recipient_id: string
  conversation?: { id: string; origin: { type: string }; expiration_timestamp?: string }
  pricing?: { billable: boolean; pricing_model: string; category: string }
  errors?: ApiError[]
}

// ─────────────────────────────────────────────────────────────────────────────
// API errors
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiError {
  code: number
  title: string
  message?: string
  error_data?: { details: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Processed / normalised event types (used internally)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessedMessage {
  messageId: string
  from: string
  /** phone_number_id that received the message */
  to: string
  timestamp: Date
  type: MessageType
  text?: string
  mediaId?: string
  mediaType?: string
  caption?: string
  location?: LocationObject
  interactiveResponse?: { type: 'button' | 'list'; id: string; title: string }
  contextMessageId?: string
  /** Arbitrary extra fields — never logged */
  metadata: Record<string, unknown>
}

export interface ProcessedStatus {
  messageId: string
  status: StatusType
  recipientId: string
  timestamp: Date
  conversationId?: string
  errorCode?: number
  errorMessage?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbound templates
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateId =
  | 'gymflow_welcome_member'
  | 'membership_renewed'
  | 'membership_expiry_reminder'
  | 'membership_expired'
  | 'payment_due_reminder'
  | 'birthday_wishes'

export interface TemplateContext {
  /** 10-digit or E.164 */
  phone: string
  gymName: string
  memberName: string
  plan?: string
  startDate?: string
  validUntil?: string
  expiryDate?: string
  daysRemaining?: number
  /** Rupees */
  dueAmount?: number
}

export interface SendResult {
  success: boolean
  messageId?: string
  /** Populated on failure */
  error?: string
  /** HTTP status from Meta, if available */
  httpStatus?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Service layer — graph.ts inputs
// ─────────────────────────────────────────────────────────────────────────────

export interface SendMessageOptions {
  to: string
  type: string
  [key: string]: unknown
}

export interface UploadMediaOptions {
  buffer: Buffer
  mimeType: string
  filename: string
}

export interface UploadMediaResult {
  success: boolean
  mediaId?: string
  error?: string
}

export interface MediaInfo {
  id: string
  url: string
  mime_type: string
  sha256: string
  file_size: number
}

export interface PhoneNumberInfo {
  id: string
  display_phone_number: string
  verified_name: string
  quality_rating: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Database record shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface WhatsAppMessageRecord {
  id: string
  message_id: string
  gym_id: string
  phone_number_id: string
  from_number: string
  to_number: string
  direction: 'inbound' | 'outbound'
  message_type: MessageType
  content: string | null
  media_id: string | null
  media_type: string | null
  media_url: string | null
  caption: string | null
  status: StatusType | null
  conversation_id: string | null
  context_message_id: string | null
  metadata: Record<string, unknown>
  error_code: number | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface WebhookLogRecord {
  id: string
  request_id: string
  phone_number_id: string
  event_type: 'message' | 'status' | 'error' | 'unknown'
  payload: Record<string, unknown>
  signature_valid: boolean
  processed: boolean
  error: string | null
  processing_time_ms: number
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed error classes
// ─────────────────────────────────────────────────────────────────────────────

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'WhatsAppError'
  }
}

export class WhatsAppConfigError extends WhatsAppError {
  constructor(message: string) {
    super(message)
    this.name = 'WhatsAppConfigError'
  }
}

export class WhatsAppSignatureError extends WhatsAppError {
  constructor() {
    super('Invalid X-Hub-Signature-256', undefined, 401)
    this.name = 'WhatsAppSignatureError'
  }
}

export class WhatsAppRateLimitError extends WhatsAppError {
  constructor(public readonly retryAfterMs: number) {
    super('WhatsApp API rate limit exceeded', undefined, 429)
    this.name = 'WhatsAppRateLimitError'
  }
}

export class WhatsAppUpstreamError extends WhatsAppError {
  constructor(message: string, httpStatus: number) {
    super(message, undefined, httpStatus)
    this.name = 'WhatsAppUpstreamError'
  }
}
