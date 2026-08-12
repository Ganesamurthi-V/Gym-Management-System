/**
 * WhatsApp Repository
 * 
 * Data access layer for WhatsApp messages and webhook logs.
 * All database operations go through this repository.
 */

import { createClient } from '@supabase/supabase-js'
import type {
  ProcessedMessage,
  ProcessedStatus,
  WhatsAppMessage,
  WhatsAppWebhookLog,
} from '@/lib/whatsapp/webhookTypes'

/**
 * Get Supabase admin client for server-side operations
 * Uses service role key to bypass RLS
 */
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables not configured')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * Save incoming message to database
 */
export async function saveIncomingMessage(
  message: ProcessedMessage,
  gymId: string,
  contactName?: string
): Promise<void> {
  const supabase = getSupabaseAdmin()

  const record = {
    message_id: message.messageId,
    gym_id: gymId,
    phone_number_id: message.to,
    from_number: message.from,
    to_number: message.to,
    direction: 'inbound' as const,
    message_type: message.type,
    content: message.text ?? null,
    media_id: message.mediaId ?? null,
    media_type: message.mediaType ?? null,
    media_url: null, // Will be populated when media is downloaded
    caption: message.caption ?? null,
    status: null, // Inbound messages don't have status
    conversation_id: null,
    context_message_id: message.contextMessageId ?? null,
    metadata: {
      ...message.metadata,
      contactName,
      location: message.location,
      interactiveResponse: message.interactiveResponse,
    },
    error_code: null,
    error_message: null,
  }

  const { error } = await supabase
    .from('whatsapp_messages')
    .insert(record)

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`)
  }
}

/**
 * Update message status
 */
export async function updateMessageStatus(
  status: ProcessedStatus
): Promise<void> {
  const supabase = getSupabaseAdmin()

  const updates: Partial<WhatsAppMessage> = {
    status: status.status,
    conversation_id: status.conversationId ?? null,
    error_code: status.errorCode ?? null,
    error_message: status.errorMessage ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('whatsapp_messages')
    .update(updates)
    .eq('message_id', status.messageId)

  if (error) {
    throw new Error(`Failed to update message status: ${error.message}`)
  }
}

/**
 * Save webhook event log for debugging and monitoring
 */
export async function saveWebhookLog(
  requestId: string,
  phoneNumberId: string,
  eventType: 'message' | 'status' | 'error' | 'unknown',
  payload: unknown,
  signatureValid: boolean,
  processed: boolean,
  errorMessage: string | null,
  processingTimeMs: number
): Promise<void> {
  const supabase = getSupabaseAdmin()

  const record = {
    request_id: requestId,
    phone_number_id: phoneNumberId,
    event_type: eventType,
    payload: payload as Record<string, unknown>,
    signature_valid: signatureValid,
    processed,
    error: errorMessage,
    processing_time_ms: processingTimeMs,
  }

  const { error } = await supabase
    .from('whatsapp_webhook_logs')
    .insert(record)

  if (error) {
    // Log but don't throw - webhook logging shouldn't block processing
    console.error('Failed to save webhook log:', error.message)
  }
}

/**
 * Check if message already exists in database (additional idempotency check)
 */
export async function messageExists(messageId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .limit(1)

  if (error) {
    console.error('Failed to check message existence:', error.message)
    return false
  }

  return data && data.length > 0
}

/**
 * Get gym ID from phone number ID
 * Assumes you have a mapping table or configuration
 */
export async function getGymIdFromPhoneNumber(phoneNumberId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()

  // TODO: Replace with your actual gym-phone mapping logic
  // This could be a separate table like whatsapp_phone_numbers
  const { data, error } = await supabase
    .from('gym_whatsapp_config')
    .select('gym_id')
    .eq('phone_number_id', phoneNumberId)
    .limit(1)
    .single()

  if (error) {
    console.error('Failed to get gym ID:', error.message)
    return null
  }

  return data?.gym_id ?? null
}

/**
 * Save outbound message (for when you send messages)
 */
export async function saveOutboundMessage(
  messageId: string,
  gymId: string,
  phoneNumberId: string,
  toNumber: string,
  messageType: string,
  content: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin()

  const record = {
    message_id: messageId,
    gym_id: gymId,
    phone_number_id: phoneNumberId,
    from_number: phoneNumberId,
    to_number: toNumber,
    direction: 'outbound' as const,
    message_type: messageType,
    content,
    media_id: null,
    media_type: null,
    media_url: null,
    caption: null,
    status: 'sent' as const,
    conversation_id: null,
    context_message_id: null,
    metadata,
    error_code: null,
    error_message: null,
  }

  const { error } = await supabase
    .from('whatsapp_messages')
    .insert(record)

  if (error) {
    throw new Error(`Failed to save outbound message: ${error.message}`)
  }
}
