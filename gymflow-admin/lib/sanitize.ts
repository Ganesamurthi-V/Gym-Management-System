/**
 * Input sanitization utilities for admin panel
 * Prevents XSS attacks by cleaning user-provided content
 * 
 * Installation required: npm install dompurify isomorphic-dompurify
 * (For now using basic sanitization, upgrade to DOMPurify in production)
 */

/**
 * Basic HTML entity encoding to prevent XSS
 * This is a lightweight alternative until DOMPurify is installed
 */
function encodeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Sanitize text input - strips all HTML tags
 * Use for: subject lines, gym names, short text fields
 */
export function sanitizeText(input: string): string {
  if (!input) return ''
  
  // Remove all HTML tags
  const withoutTags = input.replace(/<[^>]*>/g, '')
  
  // Encode special characters
  return encodeHTML(withoutTags).trim()
}

/**
 * Sanitize multiline text - preserves line breaks but removes HTML
 * Use for: message bodies, descriptions, notes
 */
export function sanitizeMultiline(input: string): string {
  if (!input) return ''
  
  // Remove all HTML tags but preserve line breaks
  const withoutTags = input.replace(/<[^>]*>/g, '')
  
  // Encode special characters
  const encoded = encodeHTML(withoutTags)
  
  // Normalize line breaks
  return encoded
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
  if (!subject || subject.length < 3 || subject.length > 200) {
    return { error: 'Subject must be between 3 and 200 characters' }
  }
  
  const body = sanitizeMultiline(raw.body)
  if (!body || body.length < 10 || body.length > 5000) {
    return { error: 'Message body must be between 10 and 5000 characters' }
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
  if (!replySubject || replySubject.length < 3 || replySubject.length > 200) {
    return { error: 'Reply subject must be between 3 and 200 characters' }
  }
  
  const replyMessage = sanitizeMultiline(raw.replyMessage)
  if (!replyMessage || replyMessage.length < 10 || replyMessage.length > 5000) {
    return { error: 'Reply message must be between 10 and 5000 characters' }
  }
  
  return { ticketId, status, replySubject, replyMessage }
}
