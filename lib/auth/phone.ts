/**
 * Indian mobile normaliser, shared by the phone routes, signup and tests.
 * No `server-only` on purpose so unit tests can import it directly.
 */

/** E.164 `91XXXXXXXXXX` for a valid Indian mobile (10 digits starting 6-9), else null. */
export function normalizeIndianMobile(input: string): string | null {
  if (typeof input !== 'string') return null
  // Only separators a person types are ignored; any other character means it is not a number.
  if (!/^[+\d\s-]+$/.test(input)) return null
  const hasPlus = input.trim().startsWith('+')
  let digits = input.replace(/\D/g, '')
  if (hasPlus && !digits.startsWith('91')) return null
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (!/^[6-9]\d{9}$/.test(digits)) return null
  return `91${digits}`
}

/** "+91 98XXXXXX95" from `91XXXXXXXXXX`, for responses and logs. */
export function maskIndianMobile(e164: string): string {
  const n = e164.slice(-10)
  return `+91 ${n.slice(0, 2)}${'X'.repeat(6)}${n.slice(-2)}`
}

/** The owner's saved mobile (E.164) from signup / phone-save metadata, or null when absent or invalid. */
export function ownerMobileFromUser(user: { user_metadata?: Record<string, unknown> | null }): string | null {
  return normalizeIndianMobile(String(user.user_metadata?.mobile_number ?? ''))
}
