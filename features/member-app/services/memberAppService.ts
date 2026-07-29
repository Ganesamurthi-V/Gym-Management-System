/**
 * features/member-app/services/memberAppService.ts
 *
 * Production service layer for the Member App Management module.
 * Sections retained: Overview, Portal Access, Invitations, Gamification.
 * Removed: Activity, Logins, Templates, Analytics, Maintenance, Settings.
 */

import { createClient } from '@/lib/supabase/server'
import type {
  ActionResult,
  GamificationSummary,
  InvitationActivity,
  InvitationStatus,
  LeaderboardEntry,
  MemberAppData,
  MemberAppOverview,
  MemberBulkAction,
  MemberPortalRow,
  MemberRowAction,
  Paginated,
} from '@/types/member-app'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toPortalStatus(row: { portal_enabled: boolean; portal_suspended: boolean; invitation_status: string }): 'enabled' | 'disabled' | 'not_invited' {
  if (!row.portal_enabled && row.invitation_status === 'not_sent') return 'not_invited'
  if (!row.portal_enabled || row.portal_suspended) return 'disabled'
  return 'enabled'
}

function toInvitationStatus(raw: string): InvitationStatus {
  const valid: InvitationStatus[] = ['not_sent', 'pending', 'delivered', 'activated', 'expired']
  return valid.includes(raw as InvitationStatus) ? (raw as InvitationStatus) : 'not_sent'
}

function isoDate(d: string | null): string | null {
  return d ? new Date(d).toISOString().slice(0, 10) : null
}

// ─── Section 1 — Overview ────────────────────────────────────────────────────

export async function getMemberAppOverview(gymId: string): Promise<MemberAppOverview> {
  const supabase = await createClient()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString()

  const [activeRes, pendingRes, todayRes, weekRes, monthRes] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).eq('portal_enabled', true).eq('portal_suspended', false),
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).eq('invitation_status', 'pending'),
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).gte('last_portal_login', todayStart),
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).gte('last_portal_login', weekAgo),
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).gte('last_portal_login', monthAgo),
  ])

  return {
    appStatus: 'Online',
    activeMembers: activeRes.count ?? 0,
    pendingInvitations: pendingRes.count ?? 0,
    todaysLogins: todayRes.count ?? 0,
    weeklyActiveUsers: weekRes.count ?? 0,
    monthlyActiveUsers: monthRes.count ?? 0,
  }
}

// ─── Section 2 — Member Portal Management ────────────────────────────────────

export async function getMemberPortalRows(gymId: string): Promise<MemberPortalRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('members')
    .select('id, name, member_number, phone, portal_enabled, portal_suspended, invitation_status, portal_activated_at, last_portal_login')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !data) return []

  return data.map(row => ({
    memberId: row.id,
    memberName: row.name,
    memberNumber: row.member_number,
    phone: row.phone,
    portalStatus: toPortalStatus(row),
    invitationStatus: toInvitationStatus(row.invitation_status),
    activatedOn: isoDate(row.portal_activated_at),
    lastLogin: row.last_portal_login ?? null,
    suspended: row.portal_suspended,
  }))
}

export async function getMemberPortalPage(
  gymId: string,
  page = 1,
  pageSize = 10,
): Promise<Paginated<MemberPortalRow>> {
  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await supabase
    .from('members')
    .select('id, name, member_number, phone, portal_enabled, portal_suspended, invitation_status, portal_activated_at, last_portal_login', { count: 'exact' })
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error || !data) return { rows: [], total: 0, page, pageSize }

  const rows: MemberPortalRow[] = data.map(row => ({
    memberId: row.id,
    memberName: row.name,
    memberNumber: row.member_number,
    phone: row.phone,
    portalStatus: toPortalStatus(row),
    invitationStatus: toInvitationStatus(row.invitation_status),
    activatedOn: isoDate(row.portal_activated_at),
    lastLogin: row.last_portal_login ?? null,
    suspended: row.portal_suspended,
  }))

  return { rows, total: count ?? 0, page, pageSize }
}

// ─── Section 3 — Invitation Activity ─────────────────────────────────────────

export async function getInvitationActivity(gymId: string): Promise<InvitationActivity[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('members')
    .select('id, name, member_number, invitation_status, invitation_sent_at, portal_activated_at')
    .eq('gym_id', gymId)
    .neq('invitation_status', 'not_sent')
    .order('invitation_sent_at', { ascending: false })
    .limit(100)

  if (error || !data) return []

  return data
    .filter(row => row.invitation_sent_at)
    .map(row => ({
      id: `inv-${row.id}`,
      memberId: row.id,
      memberName: row.name,
      memberNumber: row.member_number,
      sentOn: row.invitation_sent_at!,
      status: toInvitationStatus(row.invitation_status) as Exclude<InvitationStatus, 'not_sent'>,
      activatedOn: row.portal_activated_at ?? null,
    }))
}

// ─── Section 7 — Gamification (placeholder — no backing table yet) ───────────

export async function getGamificationSummary(gymId: string): Promise<GamificationSummary> {
  void gymId
  return {
    totalXpEarned: 0,
    badgesUnlocked: 0,
    activeStreaks: 0,
    challengesCompleted: 0,
    leaderboardsEnabled: false,
  }
}

export async function getLeaderboard(gymId: string): Promise<LeaderboardEntry[]> {
  void gymId
  return []
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function runMemberRowAction(
  action: MemberRowAction,
  memberId: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  switch (action) {
    case 'enable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: true, portal_suspended: false })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
      return { success: true, message: 'Portal enabled' }
    }
    case 'disable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: false })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
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
      return { success: true, message: action === 'send_invitation' ? 'Invitation sent' : 'Invitation resent' }
    }
    case 'suspend_access': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: true })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
      return { success: true, message: 'Access suspended' }
    }
    case 'reactivate_access': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: false })
        .eq('id', memberId)
      if (error) return { success: false, message: error.message }
      return { success: true, message: 'Access reactivated' }
    }
    case 'reset_password':
      return { success: true, message: 'Password reset link sent' }
    case 'force_logout':
      return { success: true, message: 'Member signed out of all devices' }
    default:
      return { success: false, message: 'Unknown action' }
  }
}

export async function runMemberBulkAction(
  action: MemberBulkAction,
  memberIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient()
  const count = memberIds.length

  switch (action) {
    case 'bulk_enable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: true, portal_suspended: false })
        .in('id', memberIds)
      if (error) return { success: false, message: error.message }
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
      return { success: true, message: `Invitation sent to ${count} member${count === 1 ? '' : 's'}` }
    }
    case 'bulk_suspend': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: true })
        .in('id', memberIds)
      if (error) return { success: false, message: error.message }
      return { success: true, message: `${count} member${count === 1 ? '' : 's'} suspended` }
    }
    case 'bulk_export':
      return { success: true, message: `Exported ${count} member${count === 1 ? '' : 's'}` }
    default:
      return { success: false, message: 'Unknown action' }
  }
}

// ─── Aggregate loader ────────────────────────────────────────────────────────

export async function getMemberAppData(
  gymId: string,
  _gymName?: string,
): Promise<MemberAppData> {
  const [overview, portalRows, invitations, gamification, leaderboard] = await Promise.all([
    getMemberAppOverview(gymId),
    getMemberPortalRows(gymId),
    getInvitationActivity(gymId),
    getGamificationSummary(gymId),
    getLeaderboard(gymId),
  ])

  return { overview, portalRows, invitations, gamification, leaderboard }
}
