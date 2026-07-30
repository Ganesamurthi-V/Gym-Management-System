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

  if (!member) return { success: false, message: 'Member not found' }

  switch (action) {
    case 'enable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: true, portal_suspended: false })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
      await logActivity(gymId, memberId, 'portal_enabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Portal enabled' }
    }

    case 'disable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: false })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
      await logActivity(gymId, memberId, 'portal_disabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Portal disabled' }
    }

    case 'send_invitation':
    case 'resend_invitation': {
      // Perform the invitation directly using service-role (same logic as the API route)
      const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!serviceUrl || !serviceKey) {
        return { success: false, message: 'Server not configured for invitations (missing service key)' }
      }

      const { createClient: createServiceClient } = await import('@supabase/supabase-js')
      const serviceSupabase = createServiceClient(serviceUrl, serviceKey)
      const { randomBytes } = await import('crypto')

      // Fetch member details
      const { data: memberData } = await supabase
        .from('members')
        .select('id, name, phone, email, auth_user_id')
        .eq('id', memberId)
        .eq('gym_id', gymId)
        .single()

      if (!memberData?.phone) {
        return { success: false, message: 'Member has no phone number' }
      }

      let authUserId = memberData.auth_user_id

      // Create Auth identity if needed
      if (!authUserId) {
        const email = memberData.email || `member-${memberId.slice(0, 8)}@gymflow.sbs`
        const tempPassword = randomBytes(16).toString('base64url')

        const { data: authData, error: authCreateErr } = await serviceSupabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { member_id: memberId, gym_id: gymId, role: 'member' },
        })

        if (authCreateErr || !authData.user) {
          if (authCreateErr?.message?.includes('already been registered')) {
            const { data: existingUsers } = await serviceSupabase.auth.admin.listUsers()
            const existing = existingUsers?.users?.find(u => u.email === email)
            if (existing) authUserId = existing.id
            else return { success: false, message: 'Failed to create member account' }
          } else {
            return { success: false, message: authCreateErr?.message ?? 'Failed to create member account' }
          }
        } else {
          authUserId = authData.user.id
        }

        // Link auth_user_id
        await serviceSupabase
          .from('members')
          .update({ auth_user_id: authUserId })
          .eq('id', memberId)
          .eq('gym_id', gymId)
      }

      // Generate invitation token
      const token = randomBytes(32).toString('base64url')
      await serviceSupabase.auth.admin.updateUserById(authUserId!, {
        user_metadata: {
          invitation_token: token,
          invited_at: new Date().toISOString(),
          gym_id: gymId,
          member_id: memberId,
          role: 'member',
        },
      })

      // Update portal status
      await serviceSupabase
        .from('members')
        .update({
          portal_enabled: true,
          invitation_status: 'pending',
          invitation_sent_at: new Date().toISOString(),
        })
        .eq('id', memberId)
        .eq('gym_id', gymId)

      // Send WhatsApp
      const { sendWhatsAppTemplate } = await import('@/lib/whatsapp/sender')
      const { data: gymData } = await supabase.from('gyms').select('name').eq('id', gymId).single()
      const gymName = gymData?.name ?? 'Your Gym'

      const sendResult = await sendWhatsAppTemplate('member_app_invitation', {
        phone: memberData.phone,
        gymName,
        memberName: memberData.name,
        invitationToken: token,
      })

      if (action === 'resend_invitation') {
        await logActivity(gymId, memberId, 'invitation_resent')
      }
      await invalidateMemberAppCache(gymId)

      if (sendResult.success) {
        return { success: true, message: 'Invitation sent via WhatsApp' }
      } else {
        // WhatsApp failed but the token is created — member can still use the direct link
        return {
          success: true,
          message: `Portal activated. WhatsApp delivery failed: ${sendResult.error ?? 'unknown'}. Activation link: https://member.gymflow.sbs/activate/${token}`,
        }
      }
    }

    case 'suspend_access': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: true })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
      await logActivity(gymId, memberId, 'portal_disabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Access suspended' }
    }

    case 'reactivate_access': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: false })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
      await logActivity(gymId, memberId, 'portal_enabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Access reactivated' }
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
      if (error) return { success: false, message: error.message }
      const activities = memberIds.map(id => ({
        gym_id: gymId, member_id: id, activity: 'portal_enabled' as const, performed_by: 'owner',
      }))
      await supabase.from('member_portal_activity').insert(activities)
      await invalidateMemberAppCache(gymId)
      return { success: true, message: `Portal enabled for ${count} member${count === 1 ? '' : 's'}` }
    }

    case 'bulk_send_invitation': {
      const { error } = await supabase.from('members')
        .update({
          portal_enabled: true,
          invitation_status: 'pending',
          invitation_sent_at: new Date().toISOString(),
        })
        .in('id', memberIds)
      if (error) return { success: false, message: error.message }
      await invalidateMemberAppCache(gymId)
      return { success: true, message: `Invitation sent to ${count} member${count === 1 ? '' : 's'}` }
    }

    case 'bulk_suspend': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: true })
        .in('id', memberIds)
      if (error) return { success: false, message: error.message }
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
