import 'server-only'
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateInvitationToken, reusableInvitationToken } from '@/lib/member-invitation'
import { hasOwnerRegistrationMarker } from '@/lib/auth/owner-registration'
import { logger } from '@/lib/logger'

/**
 * Everything needed before an invitation can be sent: member auth identity, a fresh (or
 * still-valid) token in auth metadata, and the members status columns. Shared by the
 * single-member invite route and the queue drain worker, so a bulk invite mints each token
 * just before its own send (tokens expire after 24h; a big gym can wait in the queue longer).
 *
 * Takes a service-role client and always scopes by the given gymId. Callers resolve gymId
 * on the server, never from a request body.
 */

export type PrepareInvitationResult =
  | { ok: true; token: string; member: { name: string; phone: string } }
  | { ok: false; code: string; message: string; permanent: boolean }

const fail = (code: string, message: string, permanent: boolean): PrepareInvitationResult =>
  ({ ok: false, code, message, permanent })

export async function prepareMemberInvitation(
  serviceSupabase: SupabaseClient,
  params: { gymId: string; memberId: string; skipIfActivated?: boolean },
): Promise<PrepareInvitationResult> {
  const { gymId, memberId } = params

  const { data: member, error: memberErr } = await serviceSupabase
    .from('members')
    .select('id, name, phone, email, auth_user_id, portal_enabled, invitation_status')
    .eq('id', memberId)
    .eq('gym_id', gymId)
    .single()

  if (memberErr || !member) {
    // PGRST116 = no row. Any other error is a database problem that a retry may clear.
    const permanent = !memberErr || memberErr.code === 'PGRST116'
    return fail('NOT_FOUND', 'Member not found in your gym', permanent)
  }

  if (!member.phone) return fail('BAD_REQUEST', 'Member has no phone number', true)

  // A queued bulk invite can wait hours; the member may have activated in the meantime.
  // Re-minting would reset their activation, so the worker opts in to stopping here.
  if (params.skipIfActivated && member.invitation_status === 'activated') {
    return fail('ALREADY_ACTIVATED', 'Member has already activated the app', true)
  }

  let authUserId: string | null = member.auth_user_id

  // If member doesn't have an Auth identity yet, create one
  if (!authUserId) {
    const email = member.email || `member-${memberId.slice(0, 8)}@gymflow.sbs`
    const tempPassword = randomBytes(16).toString('base64url')

    const { data: authData, error: authCreateErr } = await serviceSupabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Skip email verification — invited by owner
      user_metadata: {
        member_id: memberId,
        gym_id: gymId,
        role: 'member',
      },
      app_metadata: { role: 'member' },
    })

    if (authCreateErr || !authData.user) {
      // If user already exists with that email, try to find them
      if (authCreateErr?.message?.includes('already been registered')) {
        let existing = null
        for (let page = 1; page <= 50 && !existing; page += 1) {
          const { data: existingUsers } = await serviceSupabase.auth.admin.listUsers({ page, perPage: 1000 })
          existing = existingUsers?.users.find((user) => user.email === email) ?? null
          if (!existingUsers || existingUsers.users.length < 1000) break
        }

        const belongsToThisMember =
          existing?.user_metadata?.role === 'member' &&
          existing.user_metadata.member_id === memberId &&
          existing.user_metadata.gym_id === gymId

        if (existing && belongsToThisMember) {
          authUserId = existing.id
        } else {
          return fail('EMAIL_IN_USE', 'This email is already linked to another account. Use a different member email.', true)
        }
      } else {
        logger.error('prepareMemberInvitation: failed to create auth user', authCreateErr)
        return fail('AUTH_FAILED', 'Failed to create member account', false)
      }
    } else {
      authUserId = authData.user.id
    }

    // Link auth_user_id to the member row (service-role bypasses the guard trigger)
    const { error: linkErr } = await serviceSupabase
      .from('members')
      .update({ auth_user_id: authUserId })
      .eq('id', memberId)
      .eq('gym_id', gymId)

    if (linkErr) {
      logger.error('prepareMemberInvitation: failed to link auth user to member', linkErr)
      return fail('LINK_FAILED', 'Failed to link account to member', false)
    }
  }

  const { data: authUserData, error: authUserErr } =
    await serviceSupabase.auth.admin.getUserById(authUserId!)
  const authUser = authUserData.user
  if (authUserErr || !authUser) {
    logger.error('prepareMemberInvitation: failed to load member auth user', authUserErr)
    return fail('AUTH_FAILED', 'Failed to prepare member invitation', false)
  }

  const { data: ownerGym, error: ownerGymErr } = await serviceSupabase
    .from('gyms')
    .select('id')
    .eq('owner_id', authUser.id)
    .maybeSingle()

  if (ownerGymErr) {
    logger.error('prepareMemberInvitation: failed to verify member auth identity', ownerGymErr)
    return fail('AUTH_FAILED', 'Failed to verify member account', false)
  }

  if (ownerGym?.id || hasOwnerRegistrationMarker(authUser)) {
    return fail('OWNER_EMAIL', 'This email belongs to a gym owner account. Use a different member email.', true)
  }

  const linkedMemberId = authUser.user_metadata?.member_id
  if (typeof linkedMemberId === 'string' && linkedMemberId !== memberId) {
    return fail('MEMBER_EMAIL_IN_USE', 'This email is already linked to another member account.', true)
  }

  const existingToken = member.invitation_status === 'pending'
    ? reusableInvitationToken(
        authUser.user_metadata?.invitation_token,
        authUser.user_metadata?.invited_at,
        memberId,
        authUser.user_metadata?.member_id,
      )
    : null
  const token = existingToken ?? generateInvitationToken(memberId)
  const invitedAt = existingToken
    ? String(authUser.user_metadata.invited_at)
    : new Date().toISOString()

  const { error: tokenErr } = await serviceSupabase.auth.admin.updateUserById(authUserId!, {
    user_metadata: {
      ...authUser.user_metadata,
      invitation_token: token,
      invited_at: invitedAt,
      gym_id: gymId,
      member_id: memberId,
      role: 'member',
      pending_email: null,
      activation_step: null,
      activated_at: null,
    },
    app_metadata: {
      ...authUser.app_metadata,
      role: 'member',
    },
  })

  if (tokenErr) {
    logger.error('prepareMemberInvitation: failed to store invitation token', tokenErr)
    return fail('TOKEN_FAILED', 'Failed to prepare member invitation', false)
  }

  const { error: statusErr } = await serviceSupabase
    .from('members')
    .update({
      portal_enabled: true,
      invitation_status: 'pending',
      invitation_sent_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .eq('gym_id', gymId)

  if (statusErr) {
    logger.error('prepareMemberInvitation: failed to update invitation status', statusErr)
    return fail('STATUS_FAILED', 'Failed to prepare member invitation', false)
  }

  return { ok: true, token, member: { name: member.name, phone: member.phone } }
}
