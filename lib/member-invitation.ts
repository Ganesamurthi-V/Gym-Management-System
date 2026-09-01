/**
 * lib/member-invitation.ts
 *
 * Invitation token format shared by the owner app (which mints tokens) and the
 * member PWA (which resolves them).
 *
 * ── Why the format changed ───────────────────────────────────────────────────
 * Tokens used to be opaque random strings stored only in Supabase Auth
 * `user_metadata`. Resolving one meant calling
 * `auth.admin.listUsers({ perPage: 1000 })` and scanning every user in memory.
 * That had three problems:
 *
 *   1. `/api/activate/status` is polled every 3 seconds by the waiting screen,
 *      so the app was paging in up to 1000 auth users every 3 seconds.
 *   2. `listUsers` returns ONE page. Past 1000 users, valid tokens simply stop
 *      being found — and the callers treated "not found" as "already activated",
 *      silently breaking activation for everyone.
 *   3. It is O(users) on a public, unauthenticated endpoint.
 *
 * New tokens embed the member id, so resolution is a direct lookup:
 *
 *     <32 hex chars of member uuid>.<43 chars of base64url randomness>
 *
 * `.` is not part of the base64url alphabet, so it is an unambiguous separator.
 * The random half is still 32 bytes of CSPRNG output, so the token is exactly as
 * hard to guess as before — the member id half is not a secret and is never
 * trusted on its own: the random half is always compared against the value
 * stored in `user_metadata.invitation_token`.
 *
 * Legacy opaque tokens continue to work via a paginated fallback scan, so
 * invitations already in flight are not invalidated.
 */

import { randomBytes } from 'crypto'

/** Random half length in base64url chars (32 bytes → 43 chars). */
const RANDOM_BYTES = 32

/**
 * Mints an invitation token that carries its member id.
 * Store the returned string in `user_metadata.invitation_token`.
 */
export function generateInvitationToken(memberId: string): string {
  const compactId = memberId.replace(/-/g, '').toLowerCase()
  const random = randomBytes(RANDOM_BYTES).toString('base64url')
  return `${compactId}.${random}`
}

/**
 * Extracts the member id from a token, or null for legacy opaque tokens.
 * Never treat a parsed id as proof of anything — always compare the full token
 * against the stored value.
 */
export function parseInvitationToken(token: string): { memberId: string } | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [compactId, random] = parts
  if (!/^[0-9a-f]{32}$/.test(compactId)) return null
  if (!random || random.length < 20) return null

  const memberId = [
    compactId.slice(0, 8),
    compactId.slice(8, 12),
    compactId.slice(12, 16),
    compactId.slice(16, 20),
    compactId.slice(20),
  ].join('-')

  return { memberId }
}

/** Hours an invitation stays valid. Kept here so both apps agree. */
export const INVITATION_EXPIRY_HOURS = 24

/**
 * Returns an existing pending token while it is still valid for this member.
 * Retrying an uncertain WhatsApp dispatch must not rotate the bearer link: Meta
 * may have accepted the first request even when GymFlow did not receive a
 * response, and a new token would make that delivered link unusable.
 */
export function reusableInvitationToken(
  token: unknown,
  invitedAt: unknown,
  memberId: string,
  storedMemberId: unknown = memberId,
  now = Date.now(),
): string | null {
  if (typeof token !== 'string' || typeof invitedAt !== 'string') return null

  const parsed = parseInvitationToken(token)
  if (parsed) {
    if (parsed.memberId !== memberId.toLowerCase()) return null
  } else {
    // Legacy tokens did not embed the member id. They are still safe to reuse
    // when the trusted Auth metadata links this exact user to this member.
    if (storedMemberId !== memberId || token.length < 20 || token.length > 512 || /\s/.test(token)) {
      return null
    }
  }

  const issuedAt = new Date(invitedAt).getTime()
  if (!Number.isFinite(issuedAt)) return null

  const age = now - issuedAt
  if (age < 0 || age > INVITATION_EXPIRY_HOURS * 60 * 60 * 1000) return null

  return token
}
