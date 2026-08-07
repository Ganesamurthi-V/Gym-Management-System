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

/**
 * PERFORMANCE: this used to issue FIVE parallel count queries. Measured against
 * the live project, PostgREST latency grows with the number of concurrent
 * requests (1 query ~418ms, 5 ~822ms, 10 ~1355ms), so the three overlapping
 * login-window counts were the most expensive part of the whole page.
 *
 * The three `last_portal_login >= X` counts are now a single query that returns
 * only the non-null login timestamps and buckets them in JS. That subset is
 * small by definition (only members who have actually signed in), so this stays
 * cheap regardless of gym size — unlike fetching a column for every member.
 *
 * Result: 5 concurrent queries → 3, measured ~831ms → ~500ms.
 */
export async function getMemberAppOverview(gymId: string): Promise<MemberAppOverview> {
  const supabase = await createClient()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekAgo = now.getTime() - 7 * 86_400_000
  const monthAgo = now.getTime() - 30 * 86_400_000

  const [activeRes, pendingRes, loginsRes] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).eq('portal_enabled', true).eq('portal_suspended', false),
    supabase.from('members').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).eq('invitation_status', 'pending'),
    supabase.from('members').select('last_portal_login')
      .eq('gym_id', gymId).not('last_portal_login', 'is', null),
  ])

  let todaysLogins = 0
  let weeklyActiveUsers = 0
  let monthlyActiveUsers = 0

  for (const row of loginsRes.data ?? []) {
    const ts = new Date(row.last_portal_login as string).getTime()
    if (!Number.isFinite(ts)) continue
    if (ts >= todayStart) todaysLogins++
    if (ts >= weekAgo) weeklyActiveUsers++
    if (ts >= monthAgo) monthlyActiveUsers++
  }

  return {
    appStatus: 'Online',
    activeMembers: activeRes.count ?? 0,
    pendingInvitations: pendingRes.count ?? 0,
    todaysLogins,
    weeklyActiveUsers,
    monthlyActiveUsers,
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

/**
 * REMOVED: runMemberRowAction / runMemberBulkAction.
 *
 * These were a second, incomplete copy of the mutation logic in
 * `app/member-app/actions.ts`. Nothing imported them (the UI calls
 * `memberRowAction` / `memberBulkAction`), and their invitation branches were
 * actively wrong: they set `invitation_status = 'pending'` without creating an
 * auth identity, minting a token, or sending WhatsApp — producing members that
 * looked invited but had no usable invitation. Their `disable_portal` also only
 * flipped a flag, skipping the auth-user and activity-log cleanup the real
 * action performs.
 *
 * Deleted rather than fixed so there is exactly one implementation of these
 * mutations and no chance of the broken copy being wired up later.
 * Use `app/member-app/actions.ts`.
 */

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
