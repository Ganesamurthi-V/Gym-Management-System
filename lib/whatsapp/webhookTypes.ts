/**
 * WhatsApp Cloud API Webhook Types
 * 
 * Complete type definitions for all WhatsApp webhook events.
 * Based on Meta's official API documentation.
 */

// ─── Meta Webhook Container ──────────────────────────────────────────────────

export interface MetaWebhookPayload {
  object: 'whatsapp_business_account'
  entry: WebhookEntry[]
}

export interface WebhookEntry {
  id: string // WhatsApp Business Account ID
  changes: WebhookChange[]
}

export interface WebhookChange {
  value: WebhookValue
  field: 'messages' | 'message_template_status_update' | string
}

export interface WebhookValue {
  messaging_product: 'whatsapp'
  metadata: Metadata
  contacts?: Contact[]
  messages?: Message[]
  statuses?: Status[]
  errors?: ErrorPayload[]
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export interface Metadata {
  display_phone_number: string
  phone_number_id: string
}

// ─── Contact ─────────────────────────────────────────────────────────────────

export interface Contact {
  profile: {
    name: string
  }
  wa_id: string // WhatsApp ID (phone number)
}

// ─── Message Types ───────────────────────────────────────────────────────────

export type MessageType = 
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
  | 'order'
  | 'system'
  | 'reaction'
  | 'unknown'

export interface Message {
  from: string // sender phone number
  id: string // message ID
  timestamp: string // Unix timestamp
  type: MessageType
  context?: MessageContext
  text?: TextMessage
  image?: MediaMessage
  video?: MediaMessage
  audio?: MediaMessage
  document?: DocumentMessage
  sticker?: MediaMessage
  location?: LocationMessage
  contacts?: ContactMessage[]
  interactive?: InteractiveMessage
  button?: ButtonMessage
  order?: OrderMessage
  system?: SystemMessage
  reaction?: ReactionMessage
  errors?: ErrorPayload[]
  identity?: IdentityInfo
  referral?: ReferralInfo
}

export interface MessageContext {
  from: string // original sender
  id: string // original message ID
  forwarded?: boolean
  frequently_forwarded?: boolean
}

export interface TextMessage {
  body: string
}

export interface MediaMessage {
  id?: string // media ID
  mime_type?: string
  sha256?: string
  caption?: string
}

export interface DocumentMessage extends MediaMessage {
  filename?: string
}

export interface LocationMessage {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface ContactMessage {
  name: {
    formatted_name: string
    first_name?: string
    last_name?: string
  }
  phones?: Array<{
    phone: string
    type?: string
  }>
  emails?: Array<{
    email: string
    type?: string
  }>
}

export interface InteractiveMessage {
  type: 'button_reply' | 'list_reply'
  button_reply?: {
    id: string
    title: string
  }
  list_reply?: {
    id: string
    title: string
    description?: string
  }
}

export interface ButtonMessage {
  text: string
  payload: string
}

export interface OrderMessage {
  catalog_id: string
  product_items: Array<{
    product_retailer_id: string
    quantity: number
    item_price: number
    currency: string
  }>
  text?: string
}

export interface SystemMessage {
  body: string
  type: 'customer_changed_number' | 'customer_identity_changed' | string
  identity?: string
  wa_id?: string
  customer?: string
}

export interface ReactionMessage {
  message_id: string
  emoji: string
}

export interface IdentityInfo {
  acknowledged: boolean
  created_timestamp: string
  hash: string
}

export interface ReferralInfo {
  source_url: string
  source_id: string
  source_type: string
  headline?: string
  body?: string
  media_type?: string
  image_url?: string
  video_url?: string
  thumbnail_url?: string
}

// ─── Status Updates ──────────────────────────────────────────────────────────

export type StatusType = 'sent' | 'delivered' | 'read' | 'failed' | 'deleted'

export interface Status {
  id: string // message ID
  status: StatusType
  timestamp: string // Unix timestamp
  recipient_id: string // recipient phone number
  conversation?: Conversation
  pricing?: Pricing
  errors?: ErrorPayload[]
}

export interface Conversation {
  id: string
  origin: {
    type: 'user_initiated' | 'business_initiated' | 'referral_conversion' | 'authentication' | 'marketing' | 'utility' | 'service'
  }
  expiration_timestamp?: string
}

export interface Pricing {
  billable: boolean
  pricing_model: 'CBP' | string
  category: 'user_initiated' | 'business_initiated' | 'referral_conversion' | 'authentication' | 'marketing' | 'utility' | 'service'
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export interface ErrorPayload {
  code: number
  title: string
  message?: string
  error_data?: {
    details: string
  }
}

// ─── Processed Event Types ───────────────────────────────────────────────────

export interface ProcessedMessage {
  messageId: string
  from: string
  to: string // phone_number_id
  timestamp: Date
  type: MessageType
  text?: string
  mediaId?: string
  mediaType?: string
  caption?: string
  location?: {
    latitude: number
    longitude: number
    name?: string
    address?: string
  }
  contactName?: string
  interactiveResponse?: {
    type: 'button' | 'list'
    id: string
    title: string
  }
  contextMessageId?: string
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

// ─── Database Models ─────────────────────────────────────────────────────────

export interface WhatsAppMessage {
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

export interface WhatsAppWebhookLog {
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
