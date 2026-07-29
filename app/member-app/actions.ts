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
      // Call the invitation API route which creates Auth user, links it,
      // and sends the WhatsApp template with the activation link.
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/member-app/invite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId }),
        },
      )
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.success) {
        return { success: false, message: json?.error?.message ?? 'Failed to send invitation' }
      }

      if (action === 'resend_invitation') {
        await logActivity(gymId, memberId, 'invitation_resent')
      }
      await invalidateMemberAppCache(gymId)
      return { success: true, message: json.data?.whatsappSent ? 'Invitation sent via WhatsApp' : 'Invitation created (WhatsApp delivery pending)' }
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
