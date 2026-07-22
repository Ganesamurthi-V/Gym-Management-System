/**
 * Input sanitization utilities for admin panel
 * Prevents XSS attacks by stripping HTML tags from user-provided content.
 *
 * NOTE: We do NOT HTML-entity-encode the output here because all content is
 * rendered via React text nodes ({msg.body}), never via dangerouslySetInnerHTML.
 * React escapes text nodes automatically, so double-encoding would show raw
 * entities like &quot; on screen. We only strip <tags> for safety.
 */

/**
 * Strip all HTML tags from a string.
 * Safe to use for React text nodes — React handles escaping automatically.
 */
function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, '')
}

/**
 * Sanitize text input - strips all HTML tags.
 * Use for: subject lines, gym names, short text fields
 */
export function sanitizeText(input: string): string {
  if (!input) return ''
  return stripTags(input).trim()
}

/**
 * Sanitize multiline text - strips HTML tags, preserves line breaks.
 * Use for: message bodies, descriptions, notes
 */
export function sanitizeMultiline(input: string): string {
  if (!input) return ''
  return stripTags(input)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
}

/**
 * Sanitize UUID - ensures input is valid UUID format
 * Use for: gym IDs, ticket IDs, user IDs
 */
export function sanitizeUUID(input: string): string | null {
  if (!input) return null
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  
  if (uuidRegex.test(input)) {
    return input.toLowerCase()
  }
  
  return null
}

/**
 * Sanitize enum value - ensures input matches allowed values
 * Use for: message types, ticket statuses, etc.
 */
export function sanitizeEnum<T extends string>(
  input: string,
  allowedValues: readonly T[]
): T | null {
  if (!input) return null
  
  const normalized = input.toLowerCase() as T
  
  if (allowedValues.includes(normalized)) {
    return normalized
  }
  
  return null
}

/**
 * Validate and sanitize date string (YYYY-MM-DD format)
 */
export function sanitizeDate(input: string): string | null {
  if (!input) return null
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  
  if (!dateRegex.test(input)) return null
  
  const date = new Date(input)
  if (isNaN(date.getTime())) return null
  
  return input
}

/**
 * Sanitize integer input
 */
export function sanitizeInt(input: any, min?: number, max?: number): number | null {
  const num = parseInt(String(input), 10)
  
  if (isNaN(num)) return null
  if (min !== undefined && num < min) return null
  if (max !== undefined && num > max) return null
  
  return num
}

/**
 * Comprehensive sanitization for support message
 */
export interface SanitizedSupportMessage {
  gymId: string
  subject: string
  body: string
  type: 'info' | 'warning' | 'error' | 'success'
}

export function sanitizeSupportMessage(raw: any): SanitizedSupportMessage | { error: string } {
  const gymId = sanitizeUUID(raw.gym_id)
  if (!gymId) {
    return { error: 'Invalid gym ID' }
  }
  
  const subject = sanitizeText(raw.subject)
  if (!subject) {
    return { error: 'Subject is required' }
  }
  
  const body = sanitizeMultiline(raw.body)
  if (!body) {
    return { error: 'Message body is required' }
  }
  
  const type = sanitizeEnum(raw.type, ['info', 'warning', 'error', 'success'])
  if (!type) {
    return { error: 'Invalid message type' }
  }
  
  return { gymId, subject, body, type }
}

/**
 * Comprehensive sanitization for support ticket resolution
 */
export interface SanitizedTicketResolution {
  ticketId: string
  status: 'resolved'
  replySubject: string
  replyMessage: string
}

export function sanitizeTicketResolution(raw: any): SanitizedTicketResolution | { error: string } {
  const ticketId = sanitizeUUID(raw.ticketId)
  if (!ticketId) {
    return { error: 'Invalid ticket ID' }
  }
  
  const status = sanitizeEnum(raw.status, ['resolved'])
  if (!status) {
    return { error: 'Invalid status' }
  }
  
  const replySubject = sanitizeText(raw.replySubject)
  if (!replySubject) {
    return { error: 'Reply subject is required' }
  }
  
  const replyMessage = sanitizeMultiline(raw.replyMessage)
  if (!replyMessage) {
    return { error: 'Reply message is required' }
  }
  
  return { ticketId, status, replySubject, replyMessage }
}
