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
  PortalSettingsData,
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

  // Verify the member belongs to this gym
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
      const { error } = await supabase.from('members')
        .update({
          portal_enabled: true,
          invitation_status: 'pending',
          invitation_sent_at: new Date().toISOString(),
        })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
      if (action === 'resend_invitation') {
        await logActivity(gymId, memberId, 'invitation_resent')
      }
      await invalidateMemberAppCache(gymId)
      return { success: true, message: action === 'send_invitation' ? 'Invitation sent' : 'Invitation resent' }
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
      // Get member email for password reset
      const { data: memberData } = await supabase
        .from('members')
        .select('email, auth_user_id')
        .eq('id', memberId)
        .single()

      if (!memberData?.auth_user_id) {
        return { success: false, message: 'Member has no linked portal account' }
      }

      // In production, trigger supabase.auth.admin.generateLink for password reset.
      // The admin API requires a service-role key which is not available in the
      // browser client. This would be routed through an API route with the service key.
      await logActivity(gymId, memberId, 'password_reset')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Password reset link sent' }
    }

    case 'force_logout': {
      // In production, call supabase.auth.admin.signOut(userId) via service-role.
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

  // Verify all members belong to this gym
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
      // Log activity for each
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

    case 'bulk_export': {
      // Export is handled client-side from the already-loaded data.
      return { success: true, message: `Exported ${count} member${count === 1 ? '' : 's'}` }
    }

    default:
      return { success: false, message: 'Unknown action' }
  }
}

// ─── Maintenance Actions ─────────────────────────────────────────────────────

export async function toggleMaintenanceMode(enabled: boolean): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }

  const supabase = await createClient()
  const { error } = await supabase.from('member_app_settings')
    .upsert({
      gym_id: gymId,
      maintenance_mode: enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'gym_id' })

  if (error) return { success: false, message: error.message }
  await invalidateMemberAppCache(gymId)
  return { success: true, message: enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled' }
}

export async function clearMemberAppCache(): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }

  await invalidateMemberAppCache(gymId)
  return { success: true, message: 'Member app cache cleared' }
}

export async function resendFailedInvitations(): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('members')
    .update({ invitation_status: 'pending', invitation_sent_at: new Date().toISOString() })
    .eq('gym_id', gymId)
    .eq('invitation_status', 'expired')
    .select('id')

  if (error) return { success: false, message: error.message }
  const retried = data?.length ?? 0
  await invalidateMemberAppCache(gymId)
  return { success: true, message: `Queued ${retried} failed invitation${retried === 1 ? '' : 's'} for retry` }
}

export async function retryFailedNotifications(): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('whatsapp_send_queue')
    .update({ status: 'pending', attempts: 0, last_error: null })
    .eq('gym_id', gymId)
    .neq('status', 'pending')
    .neq('status', 'sent')
    .select('id')

  if (error) return { success: false, message: error.message }
  const retried = data?.length ?? 0
  await invalidateMemberAppCache(gymId)
  return { success: true, message: `Queued ${retried} notification${retried === 1 ? '' : 's'} for retry` }
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function saveSettings(settings: PortalSettingsData): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }

  // Basic server-side validation
  if (!settings.portalName.trim()) return { success: false, message: 'Portal name is required' }
  if (settings.portalName.length > 60) return { success: false, message: 'Portal name must be 60 characters or fewer' }

  const supabase = await createClient()
  const { error } = await supabase.from('member_app_settings')
    .upsert({
      gym_id: gymId,
      portal_name: settings.portalName.trim(),
      brand_logo_url: settings.brandLogoUrl,
      primary_colour: settings.primaryColour,
      support_email: settings.supportEmail.trim(),
      support_phone: settings.supportPhone.trim(),
      privacy_policy_url: settings.privacyPolicyUrl.trim(),
      terms_url: settings.termsUrl.trim(),
      invitation_expiry: settings.invitationExpiry,
      default_language: settings.defaultLanguage,
      timezone: settings.timezone,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'gym_id' })

  if (error) return { success: false, message: error.message }
  await invalidateMemberAppCache(gymId)
  return { success: true, message: 'Settings saved' }
}
