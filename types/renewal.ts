/**
 * Member-initiated payments by UPI. Two kinds share one flow and one table (member_renewal_requests):
 *   - 'renewal': the member picks one of the gym's plans and pays for it; approving inserts a memberships row.
 *   - 'due': the member pays part or all of their pending dues; approving reduces members.pending_amount and
 *     records a due_payments row (payment mode upi), exactly what the owner's Collect action does.
 *
 * Member-initiated membership renewal: the member picks one of the gym's plans, pays the gym's UPI
 * account, and uploads a screenshot or PDF of the payment. The owner checks the proof and confirms,
 * which renews the membership. GymFlow cannot see UPI payments, so the owner's check is the confirmation.
 *
 * Shared by the member app, the owner console and the API routes. See supabase/migrations/
 * 20261027150000_member_renewal_requests.sql for the table and the functions behind it.
 */

/** The memberships.plan values the database accepts. */
export type RenewalDuration = 'monthly' | 'quarterly' | 'annual'

export type RenewalCategory = 'strength' | 'cardio' | 'both'

/** One plan the member can renew onto, from the owner's saved plans (gyms.onboarding_data.plans). */
export interface RenewalPlanOption {
  /** Stable for one request: the plan's position in the owner's list, as a string ('0', '1', ...). */
  key: string
  /** The owner's own name for it, e.g. "Monthly" or "Yoga, 3 months". */
  name: string
  duration: RenewalDuration
  /** Length in months: 1, 3 or 12. */
  months: number
  category: RenewalCategory
  /** Whole rupees. Joining fee is not included: this is a renewal. */
  price: number
}

/** The owner's UPI account, parsed from the QR they uploaded. Safe to show members: it is what the QR contains. */
export interface RenewalUpi {
  upiId: string
  merchantName: string
  merchantCode: string | null
}

export interface RenewalOptions {
  gymName: string
  plans: RenewalPlanOption[]
  /** null when the owner has not uploaded a UPI QR: the member cannot pay in the app. */
  upi: RenewalUpi | null
}

export type RenewalStatus = 'pending' | 'approved' | 'rejected'

export type RenewalKind = 'renewal' | 'due'

/** A request as the member sees it. */
export interface RenewalRequest {
  id: string
  kind: RenewalKind
  /** The plan name for a renewal; the text 'Due payment' for a due payment. */
  planName: string
  /** null for a due payment. */
  duration: RenewalDuration | null
  /** null for a due payment. */
  months: number | null
  category: RenewalCategory
  amount: number
  status: RenewalStatus
  transactionId: string | null
  notes: string | null
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
}

/** A request as the owner sees it, with the member it belongs to. */
export interface OwnerRenewalRequest extends RenewalRequest {
  memberId: string
  memberName: string
  /** The printed member number (shown as GF0042 with formatMemberId). */
  memberNumber: number
  memberPhone: string
  /** The member's current plan end date (YYYY-MM-DD), or null if they have never had a plan. */
  currentEndDate: string | null
}

/** What the member's renew page needs. */
export interface RenewalPageData {
  options: RenewalOptions
  /** The newest RENEWAL request of this member (any status), or null. */
  latest: RenewalRequest | null
  /** The member's pending dues in whole rupees (members.pending_amount), 0 when none. */
  pendingDue: number
  /** The newest DUE-PAYMENT request of this member (any status), or null. */
  latestDue: RenewalRequest | null
}

/** What POST /api/renewal-requests/{id}/approve returns for a 'due' request. */
export interface DueApproveResult {
  collected: number
  newPending: number
}

/** Error codes the member and owner routes return in `error.code`. */
export type RenewalErrorCode =
  | 'NO_PLANS'
  | 'NO_UPI'
  | 'INVALID_PLAN'
  | 'INVALID_FILE'
  | 'ALREADY_PENDING'
  | 'NOT_PENDING'
  | 'NOTHING_DUE'
  | 'INVALID_AMOUNT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'FORBIDDEN'
  | 'SERVER_ERROR'
