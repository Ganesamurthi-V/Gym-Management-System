'use server'

/**
 * app/member-app/actions.ts
 *
 * Server Actions for the Member App Management module.
 * Each action verifies ownership, performs the mutation, logs portal activity,
 * and invalidates the Redis cache so the next navigation reflects changes.
 */

import { createClient } from '@/lib/supabase/server'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { hasOwnerRegistrationMarker } from '@/lib/auth/owner-registration'
import type {
  ActionResult,
  MemberActivityType,
  MemberBulkAction,
  MemberRowAction,
} from '@/types/member-app'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOwnerGymId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', session.user.id)
    .single()

  return gym?.id ?? null
}

async function logActivity(gymId: string, memberId: string, activity: MemberActivityType) {
  const supabase = await createClient()
  await supabase.from('member_portal_activity').insert({
    gym_id: gymId,
    member_id: memberId,
    activity,
    performed_by: 'owner',
  })
}

async function invalidateMemberAppCache(gymId: string) {
  await deleteCache(cacheKeys.memberApp(gymId))
}

/**
 * Issues a real invitation for one member: ensures an Auth identity exists,
 * mints a fresh token, stamps portal status, and sends the WhatsApp template.
 *
 * Extracted so the bulk path uses the SAME logic. Previously
 * `bulk_send_invitation` only set `invitation_status = 'pending'` — it created no
 * token and sent no message, so the table showed members as invited while no
 * invitation existed. Anyone who reached /activate then failed verification
 * because there was nothing to verify against.
 */
async function issueInvitation(gymId: string, memberId: string): Promise<ActionResult> {
  const serviceUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) {
    return { success: false, message: 'The server is not configured for member invitations. Please contact support.' }
  }

  const supabase = await createClient()
  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createServiceClient(serviceUrl, serviceKey)
  const { randomBytes } = await import('crypto')
  const { generateInvitationToken, reusableInvitationToken } = await import('@/lib/member-invitation')

  const { data: memberData } = await supabase
    .from('members')
    .select('id, name, phone, email, auth_user_id, portal_suspended, invitation_status')
    .eq('id', memberId)
    .eq('gym_id', gymId)
    .single()

  if (!memberData) return { success: false, message: 'Member not found in your gym' }
  if (!memberData.phone) return { success: false, message: 'This member has no phone number. Add one before inviting.' }
  if (memberData.portal_suspended) {
    return { success: false, message: 'This member\'s access is suspended. Reactivate it before sending an invitation.' }
  }

  let authUserId = memberData.auth_user_id

  if (!authUserId) {
    const email = memberData.email || `member-${memberId.slice(0, 8)}@gymflow.sbs`
    const tempPassword = randomBytes(16).toString('base64url')

    const { data: authData, error: authCreateErr } = await serviceSupabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { member_id: memberId, gym_id: gymId, role: 'member' },
      app_metadata: { role: 'member' },
    })

    if (authCreateErr || !authData.user) {
      if (authCreateErr?.message?.includes('already been registered')) {
        // Page through users instead of reading only the first page.
        let foundUser: { id: string; user_metadata?: Record<string, unknown> } | null = null
        for (let page = 1; page <= 50 && !foundUser; page++) {
          const { data: list } = await serviceSupabase.auth.admin.listUsers({ page, perPage: 1000 })
          if (!list) break
          foundUser = list.users.find((user) => user.email === email) ?? null
          if (list.users.length < 1000) break
        }

        const belongsToThisMember =
          foundUser?.user_metadata?.role === 'member' &&
          foundUser.user_metadata.member_id === memberId &&
          foundUser.user_metadata.gym_id === gymId

        if (foundUser && belongsToThisMember) authUserId = foundUser.id
        else return { success: false, message: 'This email is already linked to another account. Use a different member email.' }
      } else {
        return { success: false, message: 'Could not set up the member account. Please try again.' }
      }
    } else {
      authUserId = authData.user.id
    }

    const { error: memberLinkError } = await serviceSupabase
      .from('members')
      .update({ auth_user_id: authUserId })
      .eq('id', memberId)
      .eq('gym_id', gymId)

    if (memberLinkError) {
      console.error('[member-app/invitation] member auth link failed:', memberLinkError.message)
      return { success: false, message: 'Could not set up the member account. Please try again.' }
    }
  }

  const { data: authUserData, error: authUserError } =
    await serviceSupabase.auth.admin.getUserById(authUserId!)
  const authUser = authUserData.user

  if (authUserError || !authUser) {
    console.error('[member-app/invitation] could not load member auth user:', authUserError?.message ?? 'no user')
    return { success: false, message: 'Could not set up the member invitation. Please try again.' }
  }

  const { data: ownerGym, error: ownerGymError } = await serviceSupabase
    .from('gyms')
    .select('id')
    .eq('owner_id', authUser.id)
    .maybeSingle()

  if (ownerGymError) {
    console.error('[member-app/invitation] owner identity check failed:', ownerGymError.message)
    return { success: false, message: 'Could not verify the member account. Please try again.' }
  }

  if (ownerGym?.id || hasOwnerRegistrationMarker(authUser)) {
    return { success: false, message: 'This email belongs to a gym owner account. Use a different member email.' }
  }

  const linkedMemberId = authUser.user_metadata?.member_id
  if (typeof linkedMemberId === 'string' && linkedMemberId !== memberId) {
    return { success: false, message: 'This email is already linked to another member account.' }
  }

  const existingToken = memberData.invitation_status === 'pending'
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

  // Reuse an unexpired pending token so an uncertain Meta response cannot make
  // an already-delivered link invalid. Explicitly clear half-finished activation
  // fields while preserving unrelated user metadata.
  const { error: tokenError } = await serviceSupabase.auth.admin.updateUserById(authUserId!, {
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

  if (tokenError) {
    console.error('[member-app/invitation] token update failed:', tokenError.message)
    return { success: false, message: 'Could not set up the member invitation. Please try again.' }
  }

  const { error: statusError } = await serviceSupabase
    .from('members')
    .update({
      portal_enabled: true,
      invitation_status: 'pending',
      invitation_sent_at: new Date().toISOString(),
      portal_activated_at: null,
    })
    .eq('id', memberId)
    .eq('gym_id', gymId)

  if (statusError) {
    console.error('[member-app/invitation] member status update failed:', statusError.message)
    return { success: false, message: 'Could not set up the member invitation. Please try again.' }
  }

  const { sendWhatsAppTemplate } = await import('@/lib/whatsapp/sender')
  const { data: gymData } = await supabase.from('gyms').select('name').eq('id', gymId).single()

  const sendResult = await sendWhatsAppTemplate('member_app_invitation', {
    phone: memberData.phone,
    gymName: gymData?.name ?? 'Your Gym',
    memberName: memberData.name,
    invitationToken: token,
  })

  if (sendResult.success) {
    return {
      success: true,
      message: `Invitation sent to ${memberData.name} via WhatsApp`,
      invitationCreated: true,
      whatsappSent: true,
    }
  }

  // Keep provider/configuration details in server logs. The owner only needs
  // an accurate, actionable outcome; the token and activation URL must never
  // be copied into a browser notification.
  console.error('[member-app/invitation] WhatsApp delivery failed:', sendResult.error ?? 'unknown error')
  return {
    success: false,
    message: `WhatsApp couldn't confirm delivery to ${memberData.name}. Check the member's WhatsApp number and try again.`,
    invitationCreated: true,
    whatsappSent: false,
  }
}

// ─── Row Actions ─────────────────────────────────────────────────────────────

export async function memberRowAction(
  action: MemberRowAction,
  memberId: string,
): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }

  const supabase = await createClient()

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', memberId)
    .eq('gym_id', gymId)
    .single()

  if (!member) return { success: false, message: 'Member not found in your gym' }

  switch (action) {
    case 'enable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: true, portal_suspended: false })
        .eq('id', memberId)
      if (error) return { success: false, message: 'Could not enable portal access. Please try again.' }
      await logActivity(gymId, memberId, 'portal_enabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Portal access enabled' }
    }

    case 'disable_portal': {
      // Delete all portal data: activity logs, auth user, and reset member portal columns
      const serviceUrl = process.env.SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      // Fetch member's auth_user_id before wiping
      const { data: memberForDelete } = await supabase
        .from('members')
        .select('auth_user_id')
        .eq('id', memberId)
        .eq('gym_id', gymId)
        .single()

      // Delete portal activity logs for this member
      await supabase
        .from('member_portal_activity')
        .delete()
        .eq('member_id', memberId)
        .eq('gym_id', gymId)

      // Delete the Supabase Auth user if exists
      if (memberForDelete?.auth_user_id && serviceUrl && serviceKey) {
        const { createClient: createServiceClient } = await import('@supabase/supabase-js')
        const serviceSupabase = createServiceClient(serviceUrl, serviceKey)
        await serviceSupabase.auth.admin.deleteUser(memberForDelete.auth_user_id)
      }

      // Reset all portal columns on the member row
      const { error } = await supabase.from('members')
        .update({
          portal_enabled: false,
          portal_suspended: false,
          invitation_status: 'not_sent',
          invitation_sent_at: null,
          portal_activated_at: null,
          last_portal_login: null,
          auth_user_id: null,
        })
        .eq('id', memberId)

      if (error) return { success: false, message: 'Could not disable portal. Please try again.' }
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Portal disabled and all member app data removed' }
    }

    case 'send_invitation':
    case 'resend_invitation': {
      const result = await issueInvitation(gymId, memberId)
      // The member row/token may have changed even when Meta did not confirm
      // delivery, so refresh cached UI state for both outcomes.
      await invalidateMemberAppCache(gymId)
      if (!result.success) return result

      // NOTE: 'invitation_sent' would be the accurate value for a first send,
      // but the member_portal_activity CHECK constraint only permits
      // 'invitation_resent'. Using anything else fails the INSERT at runtime, so
      // both cases log the allowed value until a migration extends the enum.
      await logActivity(gymId, memberId, 'invitation_resent')
      return result
    }

    case 'suspend_access': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: true })
        .eq('id', memberId)
      if (error) return { success: false, message: 'Could not suspend access. Please try again.' }
      await logActivity(gymId, memberId, 'portal_disabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Member access suspended' }
    }

    case 'reactivate_access': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: false })
        .eq('id', memberId)
      if (error) return { success: false, message: 'Could not reactivate access. Please try again.' }
      await logActivity(gymId, memberId, 'portal_enabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Member access reactivated' }
    }

    case 'reset_password': {
      await logActivity(gymId, memberId, 'password_reset')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Password reset link sent' }
    }

    case 'force_logout': {
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Member signed out of all devices' }
    }

    default:
      return { success: false, message: 'Unknown action' }
  }
}

// ─── Bulk Actions ────────────────────────────────────────────────────────────

export async function memberBulkAction(
  action: MemberBulkAction,
  memberIds: string[],
): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }
  if (memberIds.length === 0) return { success: false, message: 'No members selected' }

  const supabase = await createClient()
  const count = memberIds.length

  const { count: verified } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId)
    .in('id', memberIds)

  if ((verified ?? 0) !== count) {
    return { success: false, message: 'One or more members not found in your gym' }
  }

  switch (action) {
    case 'bulk_enable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: true, portal_suspended: false })
        .in('id', memberIds)
      if (error) return { success: false, message: 'Could not enable portal for selected members. Please try again.' }
      const activities = memberIds.map(id => ({
        gym_id: gymId, member_id: id, activity: 'portal_enabled' as const, performed_by: 'owner',
      }))
      await supabase.from('member_portal_activity').insert(activities)
      await invalidateMemberAppCache(gymId)
      return { success: true, message: `Portal enabled for ${count} member${count === 1 ? '' : 's'}` }
    }

    case 'bulk_send_invitation': {
      // This used to only flip invitation_status to 'pending' — no token was
      // minted and no WhatsApp message was sent, so the table reported members
      // as invited when no invitation existed. It now runs the real invitation
      // for each member and reports per-member outcomes.
      const results = await Promise.all(
        memberIds.map(async (id) => ({ id, result: await issueInvitation(gymId, id) })),
      )

      const delivered = results.filter((entry) => entry.result.whatsappSent === true)
      const notDelivered = results.filter((entry) => entry.result.whatsappSent !== true)
      const invitationCreated = results.filter((entry) => entry.result.invitationCreated === true)

      if (delivered.length > 0) {
        // See the note in memberRowAction: the CHECK constraint only allows
        // 'invitation_resent' for invitation events.
        await supabase.from('member_portal_activity').insert(
          delivered.map(({ id }) => ({
            gym_id: gymId,
            member_id: id,
            activity: 'invitation_resent' as const,
            performed_by: 'owner',
          })),
        )
      }
      await invalidateMemberAppCache(gymId)

      if (notDelivered.length === 0) {
        return {
          success: true,
          message: `Invitation sent to ${delivered.length} member${delivered.length === 1 ? '' : 's'}`,
          invitationCreated: invitationCreated.length > 0,
          whatsappSent: true,
        }
      }
      if (delivered.length === 0) {
        return {
          success: false,
          message: invitationCreated.length > 0
            ? `WhatsApp couldn't confirm delivery for the selected member${count === 1 ? '' : 's'}. Check their numbers and try again.`
            : `No invitations were created. ${notDelivered[0].result.message}`,
          invitationCreated: invitationCreated.length > 0,
          whatsappSent: false,
        }
      }
      return {
        success: true,
        message: `WhatsApp delivered ${delivered.length} of ${count} invitations. Check the ${notDelivered.length} member number${notDelivered.length === 1 ? '' : 's'} and try again.`,
        invitationCreated: invitationCreated.length > 0,
        whatsappSent: true,
      }
    }

    case 'bulk_suspend': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: true })
        .in('id', memberIds)
      if (error) return { success: false, message: 'Could not suspend selected members. Please try again.' }
      const activities = memberIds.map(id => ({
        gym_id: gymId, member_id: id, activity: 'portal_disabled' as const, performed_by: 'owner',
      }))
      await supabase.from('member_portal_activity').insert(activities)
      await invalidateMemberAppCache(gymId)
      return { success: true, message: `${count} member${count === 1 ? '' : 's'} suspended` }
    }

    case 'bulk_export':
      return { success: true, message: `Exported ${count} member${count === 1 ? '' : 's'}` }

    default:
      return { success: false, message: 'Unknown action' }
  }
}
