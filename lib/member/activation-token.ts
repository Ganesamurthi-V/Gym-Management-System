/**
 * lib/activation-token.ts
 *
 * Server-only resolution of member invitation tokens.
 *
 * Keep the token format in sync with `lib/member-invitation.ts` in the owner
 * app (that is where tokens are minted). See that file for why the format
 * embeds the member id.
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export const INVITATION_EXPIRY_HOURS = 24

export function getServiceSupabase(): SupabaseClient {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing service role configuration')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Mirrors parseInvitationToken() in the owner app. */
function parseToken(token: string): { memberId: string } | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [compactId, random] = parts
  if (!/^[0-9a-f]{32}$/.test(compactId)) return null
  if (!random || random.length < 20) return null

  return {
    memberId: [
      compactId.slice(0, 8),
      compactId.slice(8, 12),
      compactId.slice(12, 16),
      compactId.slice(16, 20),
      compactId.slice(20),
    ].join('-'),
  }
}

/**
 * Legacy fallback for opaque tokens minted before the format change.
 *
 * Pages through ALL auth users instead of only the first 1000. The old code
 * called listUsers({ perPage: 1000 }) once, so any user beyond page 1 could
 * never be matched — and callers misread that as "already activated".
 */
async function scanAllUsersForToken(
  supabase: SupabaseClient,
  token: string,
): Promise<User | null> {
  const PER_PAGE = 1000
  const MAX_PAGES = 50 // hard stop so a public endpoint cannot be made to loop forever

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error || !data) return null

    const hit = data.users.find((u) => u.user_metadata?.invitation_token === token)
    if (hit) return hit

    if (data.users.length < PER_PAGE) return null // last page
  }
  return null
}

export type TokenResolution =
  | { ok: true; authUser: User; memberId: string; gymId: string }
  /** Token does not match any user — genuinely invalid, already used, or revoked. */
  | { ok: false; reason: 'not_found' }
  /** Token matched but is past the expiry window. */
  | { ok: false; reason: 'expired' }
  /** Token matched but the auth user has no member linkage. */
  | { ok: false; reason: 'incomplete' }
  /** Infrastructure failure — caller must NOT treat this as invalid. */
  | { ok: false; reason: 'lookup_failed' }

/**
 * Resolves an invitation token to its auth user.
 *
 * Returns a discriminated result so callers can distinguish "this token is
 * invalid" from "we could not check right now". Conflating those two is what
 * caused the activation screen to report success for unknown tokens.
 */
export async function resolveInvitationToken(
  supabase: SupabaseClient,
  token: string,
): Promise<TokenResolution> {
  let authUser: User | null = null

  const parsed = parseToken(token)

  if (parsed) {
    // O(1) path: token carries its member id.
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .select('id, gym_id, auth_user_id')
      .eq('id', parsed.memberId)
      .maybeSingle()

    if (memberErr) return { ok: false, reason: 'lookup_failed' }
    if (!member?.auth_user_id) return { ok: false, reason: 'not_found' }

    const { data, error } = await supabase.auth.admin.getUserById(member.auth_user_id)
    if (error) return { ok: false, reason: 'lookup_failed' }

    // The member id half is not a secret; the random half must match exactly.
    if (data?.user?.user_metadata?.invitation_token !== token) {
      return { ok: false, reason: 'not_found' }
    }
    authUser = data.user
  } else {
    // Legacy opaque token.
    authUser = await scanAllUsersForToken(supabase, token)
  }

  if (!authUser) return { ok: false, reason: 'not_found' }

  const invitedAt = authUser.user_metadata?.invited_at
  if (invitedAt) {
    const elapsed = Date.now() - new Date(invitedAt).getTime()
    if (Number.isFinite(elapsed) && elapsed > INVITATION_EXPIRY_HOURS * 3600 * 1000) {
      return { ok: false, reason: 'expired' }
    }
  }

  const memberId = authUser.user_metadata?.member_id
  const gymId = authUser.user_metadata?.gym_id
  if (!memberId || !gymId) return { ok: false, reason: 'incomplete' }

  return { ok: true, authUser, memberId, gymId }
}

/**
 * Positively confirms whether a member's portal is activated.
 * Used instead of inferring activation from a missing token.
 */
export async function isMemberActivated(
  supabase: SupabaseClient,
  memberId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('members')
    .select('invitation_status, portal_enabled')
    .eq('id', memberId)
    .maybeSingle()

  return data?.invitation_status === 'activated'
}

/** True for the synthetic placeholder address the owner app assigns pre-activation. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true
  return /^member-[0-9a-f]{8}@gymflow\.sbs$/i.test(email.trim())
}
