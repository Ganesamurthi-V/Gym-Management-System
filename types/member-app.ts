/**
 * types/member-app.ts
 *
 * Canonical types for the Member App Management module (Owner Portal).
 *
 * The module manages the separate `gymflow-member/` application. The database
 * bridge is the `members` table: `auth_user_id` (portal identity) and
 * `member_code`.
 *
 * PRIVACY CONTRACT — these types deliberately omit, and no consumer may add:
 *   WhatsApp message IDs, delivery receipt codes, API payloads or HTTP status
 *   codes, JWT/session tokens, browser/OS/IP/geolocation, device fingerprints,
 *   and webhook or queue internal IDs.
 */

import type { TemplateId } from '@/types/whatsapp'

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Overview
// ─────────────────────────────────────────────────────────────────────────────

export type AppStatus = 'Online' | 'Offline'

export interface MemberAppOverview {
  appStatus: AppStatus
  activeMembers: number
  pendingInvitations: number
  todaysLogins: number
  weeklyActiveUsers: number
  monthlyActiveUsers: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Member Portal Management
// ─────────────────────────────────────────────────────────────────────────────

export type PortalStatus = 'enabled' | 'disabled' | 'not_invited'

export type InvitationStatus =
  | 'not_sent'
  | 'pending'
  | 'delivered'
  | 'activated'
  | 'expired'

export interface MemberPortalRow {
  memberId: string
  memberName: string
  memberNumber: number
  phone: string
  portalStatus: PortalStatus
  invitationStatus: InvitationStatus
  /** ISO date */
  activatedOn: string | null
  /** ISO datetime */
  lastLogin: string | null
  /** Access suspended by the owner; independent of portalStatus. */
  suspended?: boolean
}

/** Server-paginated envelope so the service can be swapped for a real query. */
export interface Paginated<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export type MemberRowAction =
  | 'enable_portal'
  | 'disable_portal'
  | 'send_invitation'
  | 'resend_invitation'
  | 'suspend_access'
  | 'reactivate_access'
  | 'reset_password'
  | 'force_logout'

export type MemberBulkAction =
  | 'bulk_enable_portal'
  | 'bulk_send_invitation'
  | 'bulk_suspend'
  | 'bulk_export'

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Invitation Activity
// ─────────────────────────────────────────────────────────────────────────────

export interface InvitationActivity {
  id: string
  memberId: string
  memberName: string
  memberNumber: number
  /** ISO datetime */
  sentOn: string
  status: Exclude<InvitationStatus, 'not_sent'>
  /** ISO datetime */
  activatedOn: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Member Activity
// ─────────────────────────────────────────────────────────────────────────────

export type MemberActivityType =
  | 'portal_activated'
  | 'logged_in'
  | 'password_reset'
  | 'membership_renewed'
  | 'membership_expired'
  | 'invitation_resent'
  | 'portal_disabled'
  | 'portal_enabled'

export interface MemberActivityEvent {
  id: string
  memberId: string
  memberName: string
  memberNumber: number
  activity: MemberActivityType
  /** ISO datetime */
  occurredAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Login Overview
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginOverviewSummary {
  totalActiveMembers: number
  loggedInToday: number
  activeThisWeek: number
  pendingInvitations: number
  suspendedAccounts: number
}

export interface RecentLogin {
  memberId: string
  memberName: string
  memberNumber: number
  /** ISO datetime */
  lastLogin: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — WhatsApp Templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `broadcast_message` is a Member-App-only concept and is intentionally NOT
 * added to the shared `TemplateId` union in types/whatsapp.ts. That union is
 * the approved-template contract enforced by TEMPLATE_SPECS and
 * validateTemplatePayload before anything is dispatched to Meta; widening it
 * would both break that exhaustive Record and imply send approval this
 * template does not have.
 */
export type MemberAppTemplateId = TemplateId | 'broadcast_message'

export type TemplateApprovalStatus = 'approved' | 'pending' | 'rejected'

export interface WhatsAppTemplateStatus {
  templateId: MemberAppTemplateId
  displayName: string
  status: TemplateApprovalStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 7 — Gamification
// ─────────────────────────────────────────────────────────────────────────────

export interface GamificationSummary {
  totalXpEarned: number
  badgesUnlocked: number
  activeStreaks: number
  challengesCompleted: number
  leaderboardsEnabled: boolean
}

export interface LeaderboardEntry {
  rank: number
  memberId: string
  memberName: string
  xp: number
  badges: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 8 — Analytics
// ─────────────────────────────────────────────────────────────────────────────

/** Generic time-series point. `label` is the pre-formatted x-axis value. */
export interface TimeSeriesPoint {
  label: string
  value: number
}

export interface MemberAppAnalytics {
  dailyActiveUsers: TimeSeriesPoint[]
  weeklyActiveUsers: TimeSeriesPoint[]
  monthlyActiveUsers: TimeSeriesPoint[]
  retentionRate: TimeSeriesPoint[]
  avgSessionDuration: TimeSeriesPoint[]
  activationConversionRate: TimeSeriesPoint[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 9 — Maintenance
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceHealth = 'operational' | 'degraded' | 'down'

export interface MaintenanceStatus {
  appVersion: string
  latestVersion: string
  maintenanceMode: boolean
  supabaseStatus: ServiceHealth
  whatsappApiStatus: ServiceHealth
  notificationQueue: number
  storageUsedMb: number
  storageTotalMb: number
  /** ISO datetime */
  lastBackup: string
}

export type MaintenanceAction =
  | 'toggle_maintenance'
  | 'clear_cache'
  | 'resend_failed_invitations'
  | 'retry_failed_notifications'

// ─────────────────────────────────────────────────────────────────────────────
// Section 10 — Settings
// ─────────────────────────────────────────────────────────────────────────────

export type InvitationExpiry = '24h' | '48h' | '7d' | '30d'
export type PortalLanguage = 'en' | 'ta' | 'hi'

export interface PortalSettingsData {
  portalName: string
  brandLogoUrl: string
  primaryColour: string
  supportEmail: string
  supportPhone: string
  privacyPolicyUrl: string
  termsUrl: string
  /** Read-only, derived from the gym slug. */
  memberAppUrl: string
  invitationExpiry: InvitationExpiry
  defaultLanguage: PortalLanguage
  timezone: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate payload passed from the Server Component to the client root
// ─────────────────────────────────────────────────────────────────────────────

export interface MemberAppData {
  overview: MemberAppOverview
  portalRows: MemberPortalRow[]
  invitations: InvitationActivity[]
  activity: MemberActivityEvent[]
  loginSummary: LoginOverviewSummary
  recentLogins: RecentLogin[]
  templates: WhatsAppTemplateStatus[]
  gamification: GamificationSummary
  leaderboard: LeaderboardEntry[]
  analytics: MemberAppAnalytics
  maintenance: MaintenanceStatus
  settings: PortalSettingsData
}

/** Result shape returned by every mock/real mutation in the service layer. */
export interface ActionResult {
  success: boolean
  message: string
}
