/**
 * features/member-app/services/memberAppService.ts
 *
 * SINGLE SOURCE OF MOCK DATA for the Member App Management module.
 *
 * Every export is an async function returning a Promise so each one can be
 * swapped for a real Supabase query without touching a single component.
 * Components must never inline fixtures.
 *
 * Backend integration is deliberately out of scope — awaiting a separate task.
 */

import type {
  ActionResult,
  GamificationSummary,
  InvitationActivity,
  LeaderboardEntry,
  LoginOverviewSummary,
  MaintenanceStatus,
  MemberActivityEvent,
  MemberAppAnalytics,
  MemberAppData,
  MemberAppOverview,
  MemberBulkAction,
  MemberPortalRow,
  MemberRowAction,
  Paginated,
  PortalSettingsData,
  RecentLogin,
  TimeSeriesPoint,
  WhatsAppTemplateStatus,
} from '@/types/member-app'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Artificial latency so loading states are exercised during development. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Deterministic pseudo-random generator — keeps mock output stable across renders. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/** Fixed reference instant so fixtures do not drift mid-session. */
const NOW = new Date()

function isoDaysAgo(days: number, hour = 9, minute = 15): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function isoMinutesAgo(minutes: number): string {
  const d = new Date(NOW.getTime() - minutes * 60_000)
  return d.toISOString()
}

function dateOnlyDaysAgo(days: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** "Online" threshold for the recent-logins table. Configurable constant. */
export const ONLINE_THRESHOLD_MINUTES = 15

// ─── Member roster fixture (shared by several sections) ──────────────────────

interface RosterEntry {
  memberId: string
  memberName: string
  memberNumber: number
  phone: string
}

const ROSTER: RosterEntry[] = [
  { memberId: 'm-1001', memberName: 'Arjun Menon',        memberNumber: 1001, phone: '98407 21453' },
  { memberId: 'm-1002', memberName: 'Priya Raghavan',     memberNumber: 1002, phone: '99625 88710' },
  { memberId: 'm-1003', memberName: 'Karthik Subramanian',memberNumber: 1003, phone: '90031 44928' },
  { memberId: 'm-1004', memberName: 'Divya Lakshmi',      memberNumber: 1004, phone: '87540 63219' },
  { memberId: 'm-1005', memberName: 'Rahul Verma',        memberNumber: 1005, phone: '99404 17752' },
  { memberId: 'm-1006', memberName: 'Sneha Iyer',         memberNumber: 1006, phone: '96770 25508' },
  { memberId: 'm-1007', memberName: 'Vignesh Kumar',      memberNumber: 1007, phone: '89395 61034' },
  { memberId: 'm-1008', memberName: 'Ananya Pillai',      memberNumber: 1008, phone: '94441 90276' },
  { memberId: 'm-1009', memberName: 'Suresh Balaji',      memberNumber: 1009, phone: '90923 34815' },
  { memberId: 'm-1010', memberName: 'Meera Nair',         memberNumber: 1010, phone: '98846 70192' },
  { memberId: 'm-1011', memberName: 'Aditya Sharma',      memberNumber: 1011, phone: '73586 22940' },
  { memberId: 'm-1012', memberName: 'Kavitha Selvam',     memberNumber: 1012, phone: '95001 48863' },
  { memberId: 'm-1013', memberName: 'Nikhil Rao',         memberNumber: 1013, phone: '99529 07734' },
  { memberId: 'm-1014', memberName: 'Deepa Krishnan',     memberNumber: 1014, phone: '87905 55120' },
  { memberId: 'm-1015', memberName: 'Manoj Pandian',      memberNumber: 1015, phone: '90477 31268' },
  { memberId: 'm-1016', memberName: 'Lavanya Gopal',      memberNumber: 1016, phone: '96293 84501' },
  { memberId: 'm-1017', memberName: 'Rohit Chandran',     memberNumber: 1017, phone: '94873 12690' },
  { memberId: 'm-1018', memberName: 'Swetha Ramesh',      memberNumber: 1018, phone: '99621 45037' },
]

// ─── Section 1 — Overview ────────────────────────────────────────────────────

export async function getMemberAppOverview(gymId: string): Promise<MemberAppOverview> {
  await sleep(80)
  void gymId
  return {
    appStatus: 'Online',
    activeMembers: 48,
    pendingInvitations: 12,
    todaysLogins: 9,
    weeklyActiveUsers: 31,
    monthlyActiveUsers: 44,
  }
}

// ─── Section 2 — Member Portal Management ────────────────────────────────────

const PORTAL_ROWS: MemberPortalRow[] = [
  { ...ROSTER[0],  portalStatus: 'enabled',     invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(41), lastLogin: isoMinutesAgo(6) },
  { ...ROSTER[1],  portalStatus: 'enabled',     invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(38), lastLogin: isoMinutesAgo(52) },
  { ...ROSTER[2],  portalStatus: 'enabled',     invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(35), lastLogin: isoDaysAgo(1, 19, 40) },
  { ...ROSTER[3],  portalStatus: 'not_invited', invitationStatus: 'not_sent',  activatedOn: null,                lastLogin: null },
  { ...ROSTER[4],  portalStatus: 'enabled',     invitationStatus: 'delivered', activatedOn: null,                lastLogin: null },
  { ...ROSTER[5],  portalStatus: 'enabled',     invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(22), lastLogin: isoMinutesAgo(11) },
  { ...ROSTER[6],  portalStatus: 'disabled',    invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(64), lastLogin: isoDaysAgo(17, 8, 5),  suspended: true },
  { ...ROSTER[7],  portalStatus: 'enabled',     invitationStatus: 'pending',   activatedOn: null,                lastLogin: null },
  { ...ROSTER[8],  portalStatus: 'enabled',     invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(12), lastLogin: isoDaysAgo(2, 7, 30) },
  { ...ROSTER[9],  portalStatus: 'not_invited', invitationStatus: 'not_sent',  activatedOn: null,                lastLogin: null },
  { ...ROSTER[10], portalStatus: 'enabled',     invitationStatus: 'expired',   activatedOn: null,                lastLogin: null },
  { ...ROSTER[11], portalStatus: 'enabled',     invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(9),  lastLogin: isoDaysAgo(3, 18, 12) },
  { ...ROSTER[12], portalStatus: 'disabled',    invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(77), lastLogin: isoDaysAgo(30, 16, 44) },
  { ...ROSTER[13], portalStatus: 'enabled',     invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(6),  lastLogin: isoMinutesAgo(3) },
  { ...ROSTER[14], portalStatus: 'enabled',     invitationStatus: 'delivered', activatedOn: null,                lastLogin: null },
  { ...ROSTER[15], portalStatus: 'not_invited', invitationStatus: 'not_sent',  activatedOn: null,                lastLogin: null },
  { ...ROSTER[16], portalStatus: 'enabled',     invitationStatus: 'activated', activatedOn: dateOnlyDaysAgo(3),  lastLogin: isoDaysAgo(1, 6, 55) },
  { ...ROSTER[17], portalStatus: 'enabled',     invitationStatus: 'pending',   activatedOn: null,                lastLogin: null },
]

export async function getMemberPortalRows(gymId: string): Promise<MemberPortalRow[]> {
  await sleep(120)
  void gymId
  return PORTAL_ROWS
}

/**
 * Server-paginated variant. The mock slices in memory; a real implementation
 * would push `page`/`pageSize` down to Postgres via `.range()`.
 */
export async function getMemberPortalPage(
  gymId: string,
  page = 1,
  pageSize = 10,
): Promise<Paginated<MemberPortalRow>> {
  await sleep(120)
  void gymId
  const start = (page - 1) * pageSize
  return {
    rows: PORTAL_ROWS.slice(start, start + pageSize),
    total: PORTAL_ROWS.length,
    page,
    pageSize,
  }
}

// ─── Section 3 — Invitation Activity ─────────────────────────────────────────

const INVITATIONS: InvitationActivity[] = [
  { id: 'inv-01', ...ROSTER[0],  sentOn: isoDaysAgo(42, 10, 12), status: 'activated', activatedOn: isoDaysAgo(41, 11, 3) },
  { id: 'inv-02', ...ROSTER[1],  sentOn: isoDaysAgo(39, 11, 30), status: 'activated', activatedOn: isoDaysAgo(38, 9, 20) },
  { id: 'inv-03', ...ROSTER[2],  sentOn: isoDaysAgo(36, 9, 5),   status: 'activated', activatedOn: isoDaysAgo(35, 14, 47) },
  { id: 'inv-04', ...ROSTER[4],  sentOn: isoDaysAgo(4, 16, 22),  status: 'delivered', activatedOn: null },
  { id: 'inv-05', ...ROSTER[5],  sentOn: isoDaysAgo(23, 8, 40),  status: 'activated', activatedOn: isoDaysAgo(22, 10, 10) },
  { id: 'inv-06', ...ROSTER[6],  sentOn: isoDaysAgo(65, 12, 0),  status: 'activated', activatedOn: isoDaysAgo(64, 13, 25) },
  { id: 'inv-07', ...ROSTER[7],  sentOn: isoDaysAgo(1, 18, 15),  status: 'pending',   activatedOn: null },
  { id: 'inv-08', ...ROSTER[8],  sentOn: isoDaysAgo(13, 10, 55), status: 'activated', activatedOn: isoDaysAgo(12, 12, 5) },
  { id: 'inv-09', ...ROSTER[10], sentOn: isoDaysAgo(34, 15, 10), status: 'expired',   activatedOn: null },
  { id: 'inv-10', ...ROSTER[11], sentOn: isoDaysAgo(10, 9, 45),  status: 'activated', activatedOn: isoDaysAgo(9, 17, 30) },
  { id: 'inv-11', ...ROSTER[12], sentOn: isoDaysAgo(78, 14, 5),  status: 'activated', activatedOn: isoDaysAgo(77, 15, 50) },
  { id: 'inv-12', ...ROSTER[13], sentOn: isoDaysAgo(7, 11, 20),  status: 'activated', activatedOn: isoDaysAgo(6, 8, 35) },
  { id: 'inv-13', ...ROSTER[14], sentOn: isoDaysAgo(2, 13, 40),  status: 'delivered', activatedOn: null },
  { id: 'inv-14', ...ROSTER[16], sentOn: isoDaysAgo(4, 10, 5),   status: 'activated', activatedOn: isoDaysAgo(3, 9, 15) },
  { id: 'inv-15', ...ROSTER[17], sentOn: isoMinutesAgo(95),      status: 'pending',   activatedOn: null },
  { id: 'inv-16', ...ROSTER[9],  sentOn: isoDaysAgo(51, 9, 0),   status: 'expired',   activatedOn: null },
  { id: 'inv-17', ...ROSTER[3],  sentOn: isoDaysAgo(48, 17, 25), status: 'expired',   activatedOn: null },
]

export async function getInvitationActivity(gymId: string): Promise<InvitationActivity[]> {
  await sleep(110)
  void gymId
  return INVITATIONS
}

// ─── Section 4 — Member Activity ─────────────────────────────────────────────

const ACTIVITY: MemberActivityEvent[] = [
  { id: 'act-01', ...ROSTER[13], activity: 'logged_in',           occurredAt: isoMinutesAgo(3) },
  { id: 'act-02', ...ROSTER[0],  activity: 'logged_in',           occurredAt: isoMinutesAgo(6) },
  { id: 'act-03', ...ROSTER[5],  activity: 'logged_in',           occurredAt: isoMinutesAgo(11) },
  { id: 'act-04', ...ROSTER[1],  activity: 'membership_renewed',  occurredAt: isoMinutesAgo(52) },
  { id: 'act-05', ...ROSTER[17], activity: 'invitation_resent',   occurredAt: isoMinutesAgo(95) },
  { id: 'act-06', ...ROSTER[16], activity: 'portal_activated',    occurredAt: isoDaysAgo(3, 9, 15) },
  { id: 'act-07', ...ROSTER[2],  activity: 'password_reset',      occurredAt: isoDaysAgo(1, 19, 40) },
  { id: 'act-08', ...ROSTER[8],  activity: 'logged_in',           occurredAt: isoDaysAgo(2, 7, 30) },
  { id: 'act-09', ...ROSTER[13], activity: 'portal_activated',    occurredAt: isoDaysAgo(6, 8, 35) },
  { id: 'act-10', ...ROSTER[11], activity: 'portal_activated',    occurredAt: isoDaysAgo(9, 17, 30) },
  { id: 'act-11', ...ROSTER[6],  activity: 'portal_disabled',     occurredAt: isoDaysAgo(16, 11, 5) },
  { id: 'act-12', ...ROSTER[10], activity: 'membership_expired',  occurredAt: isoDaysAgo(19, 0, 5) },
  { id: 'act-13', ...ROSTER[5],  activity: 'membership_renewed',  occurredAt: isoDaysAgo(21, 14, 20) },
  { id: 'act-14', ...ROSTER[9],  activity: 'portal_enabled',      occurredAt: isoDaysAgo(24, 10, 45) },
  { id: 'act-15', ...ROSTER[12], activity: 'password_reset',      occurredAt: isoDaysAgo(29, 16, 10) },
  { id: 'act-16', ...ROSTER[4],  activity: 'invitation_resent',   occurredAt: isoDaysAgo(4, 16, 22) },
  { id: 'act-17', ...ROSTER[7],  activity: 'invitation_resent',   occurredAt: isoDaysAgo(1, 18, 15) },
  { id: 'act-18', ...ROSTER[14], activity: 'portal_enabled',      occurredAt: isoDaysAgo(2, 13, 40) },
]

export async function getMemberActivity(gymId: string): Promise<MemberActivityEvent[]> {
  await sleep(100)
  void gymId
  return ACTIVITY
}

// ─── Section 5 — Login Overview ──────────────────────────────────────────────

export async function getLoginOverview(gymId: string): Promise<LoginOverviewSummary> {
  await sleep(70)
  void gymId
  return {
    totalActiveMembers: 48,
    loggedInToday: 9,
    activeThisWeek: 31,
    pendingInvitations: 12,
    suspendedAccounts: 2,
  }
}

export async function getRecentLogins(gymId: string): Promise<RecentLogin[]> {
  await sleep(90)
  void gymId

  return PORTAL_ROWS
    .filter((row): row is MemberPortalRow & { lastLogin: string } => row.lastLogin !== null)
    .sort((a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime())
    .slice(0, 20)
    .map(row => ({
      memberId: row.memberId,
      memberName: row.memberName,
      memberNumber: row.memberNumber,
      lastLogin: row.lastLogin,
    }))
}

// ─── Section 6 — WhatsApp Templates ──────────────────────────────────────────

export async function getWhatsAppTemplates(gymId: string): Promise<WhatsAppTemplateStatus[]> {
  await sleep(60)
  void gymId
  return [
    { templateId: '_gymflow_welcome_member',     displayName: 'Member Invitation',  status: 'approved' },
    { templateId: 'membership_renewed',          displayName: 'Membership Renewal', status: 'approved' },
    { templateId: 'membership_expiry_reminder',  displayName: 'Expiry Reminder',    status: 'approved' },
    { templateId: '_birthday_wishes',            displayName: 'Birthday Wishes',    status: 'approved' },
    { templateId: 'broadcast_message',           displayName: 'Broadcast Messages', status: 'pending' },
  ]
}

// ─── Section 7 — Gamification ────────────────────────────────────────────────

export async function getGamificationSummary(gymId: string): Promise<GamificationSummary> {
  await sleep(80)
  void gymId
  return {
    totalXpEarned: 184_250,
    badgesUnlocked: 312,
    activeStreaks: 27,
    challengesCompleted: 96,
    leaderboardsEnabled: true,
  }
}

export async function getLeaderboard(gymId: string): Promise<LeaderboardEntry[]> {
  await sleep(80)
  void gymId
  return [
    { rank: 1, memberId: ROSTER[0].memberId,  memberName: ROSTER[0].memberName,  xp: 12_480, badges: 18 },
    { rank: 2, memberId: ROSTER[5].memberId,  memberName: ROSTER[5].memberName,  xp: 11_920, badges: 16 },
    { rank: 3, memberId: ROSTER[13].memberId, memberName: ROSTER[13].memberName, xp: 10_755, badges: 15 },
    { rank: 4, memberId: ROSTER[2].memberId,  memberName: ROSTER[2].memberName,  xp: 9_640,  badges: 13 },
    { rank: 5, memberId: ROSTER[8].memberId,  memberName: ROSTER[8].memberName,  xp: 8_915,  badges: 12 },
  ]
}

// ─── Section 8 — Analytics ───────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function buildDailySeries(seed: number, base: number, spread: number): TimeSeriesPoint[] {
  const rand = seeded(seed)
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(NOW)
    d.setDate(d.getDate() - (29 - i))
    return {
      label: `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`,
      value: Math.round(base + rand() * spread),
    }
  })
}

function buildWeeklySeries(seed: number, base: number, spread: number): TimeSeriesPoint[] {
  const rand = seeded(seed)
  return Array.from({ length: 12 }, (_, i) => ({
    label: `W${i + 1}`,
    value: Math.round(base + rand() * spread),
  }))
}

function buildMonthlySeries(seed: number, base: number, spread: number): TimeSeriesPoint[] {
  const rand = seeded(seed)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(NOW)
    d.setMonth(d.getMonth() - (11 - i))
    return {
      label: MONTH_LABELS[d.getMonth()],
      value: Math.round(base + rand() * spread),
    }
  })
}

export async function getMemberAppAnalytics(gymId: string): Promise<MemberAppAnalytics> {
  await sleep(150)
  void gymId
  return {
    dailyActiveUsers: buildDailySeries(11, 8, 14),
    weeklyActiveUsers: buildWeeklySeries(23, 22, 16),
    monthlyActiveUsers: buildMonthlySeries(31, 30, 20),
    retentionRate: buildWeeklySeries(47, 62, 28),
    avgSessionDuration: buildDailySeries(59, 4, 8),
    activationConversionRate: buildWeeklySeries(71, 48, 34),
  }
}

// ─── Section 9 — Maintenance ─────────────────────────────────────────────────

export async function getMaintenanceStatus(gymId: string): Promise<MaintenanceStatus> {
  await sleep(70)
  void gymId
  return {
    appVersion: '1.4.2',
    latestVersion: '1.4.2',
    maintenanceMode: false,
    supabaseStatus: 'operational',
    whatsappApiStatus: 'operational',
    notificationQueue: 3,
    storageUsedMb: 412,
    storageTotalMb: 2048,
    lastBackup: isoMinutesAgo(185),
  }
}

// ─── Section 10 — Settings ───────────────────────────────────────────────────

/** Slugify a gym name for the derived, read-only member app URL. */
function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'my-gym'
}

export async function getPortalSettings(
  gymId: string,
  gymName = 'My Gym',
): Promise<PortalSettingsData> {
  await sleep(70)
  void gymId
  return {
    portalName: `${gymName} Member App`,
    brandLogoUrl: '',
    primaryColour: '#2563EB',
    supportEmail: 'support@gymflow.sbs',
    supportPhone: '',
    privacyPolicyUrl: '',
    termsUrl: '',
    memberAppUrl: `https://member.gymflow.sbs/${toSlug(gymName)}`,
    invitationExpiry: '7d',
    defaultLanguage: 'en',
    timezone: 'Asia/Kolkata',
  }
}

// ─── Mutations (stubs) ───────────────────────────────────────────────────────

export async function runMemberRowAction(
  action: MemberRowAction,
  memberId: string,
): Promise<ActionResult> {
  await sleep(140)
  void memberId
  const labels: Record<MemberRowAction, string> = {
    enable_portal: 'Portal enabled',
    disable_portal: 'Portal disabled',
    send_invitation: 'Invitation sent',
    resend_invitation: 'Invitation resent',
    suspend_access: 'Access suspended',
    reactivate_access: 'Access reactivated',
    reset_password: 'Password reset link sent',
    force_logout: 'Member signed out of all devices',
  }
  return { success: true, message: labels[action] }
}

export async function runMemberBulkAction(
  action: MemberBulkAction,
  memberIds: string[],
): Promise<ActionResult> {
  await sleep(180)
  const count = memberIds.length
  const labels: Record<MemberBulkAction, string> = {
    bulk_enable_portal: `Portal enabled for ${count} member${count === 1 ? '' : 's'}`,
    bulk_send_invitation: `Invitation sent to ${count} member${count === 1 ? '' : 's'}`,
    bulk_suspend: `${count} member${count === 1 ? '' : 's'} suspended`,
    bulk_export: `Exported ${count} member${count === 1 ? '' : 's'}`,
  }
  return { success: true, message: labels[action] }
}

export async function clearMemberAppCache(gymId: string): Promise<ActionResult> {
  await sleep(160)
  void gymId
  return { success: true, message: 'Member app cache cleared' }
}

export async function resendFailedInvitations(gymId: string): Promise<ActionResult> {
  await sleep(160)
  void gymId
  return { success: true, message: 'Queued 2 failed invitations for retry' }
}

export async function retryFailedNotifications(gymId: string): Promise<ActionResult> {
  await sleep(160)
  void gymId
  return { success: true, message: 'Queued 3 notifications for retry' }
}

export async function setMaintenanceMode(
  gymId: string,
  enabled: boolean,
): Promise<ActionResult> {
  await sleep(160)
  void gymId
  return {
    success: true,
    message: enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
  }
}

export async function savePortalSettings(
  gymId: string,
  settings: PortalSettingsData,
): Promise<ActionResult> {
  await sleep(200)
  void gymId
  void settings
  return { success: true, message: 'Settings saved' }
}

// ─── Aggregate loader used by the Server Component ───────────────────────────

/**
 * Loads everything the page needs in one pass. Requests run in parallel so the
 * simulated latency does not stack.
 */
export async function getMemberAppData(
  gymId: string,
  gymName?: string,
): Promise<MemberAppData> {
  const [
    overview,
    portalRows,
    invitations,
    activity,
    loginSummary,
    recentLogins,
    templates,
    gamification,
    leaderboard,
    analytics,
    maintenance,
    settings,
  ] = await Promise.all([
    getMemberAppOverview(gymId),
    getMemberPortalRows(gymId),
    getInvitationActivity(gymId),
    getMemberActivity(gymId),
    getLoginOverview(gymId),
    getRecentLogins(gymId),
    getWhatsAppTemplates(gymId),
    getGamificationSummary(gymId),
    getLeaderboard(gymId),
    getMemberAppAnalytics(gymId),
    getMaintenanceStatus(gymId),
    getPortalSettings(gymId, gymName),
  ])

  return {
    overview,
    portalRows,
    invitations,
    activity,
    loginSummary,
    recentLogins,
    templates,
    gamification,
    leaderboard,
    analytics,
    maintenance,
    settings,
  }
}
