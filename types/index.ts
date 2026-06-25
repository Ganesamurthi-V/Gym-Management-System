export type Plan = 'monthly' | 'quarterly' | 'annual' | 'custom'
export type PaymentMode = 'cash' | 'upi' | 'card'
export type MemberStatus = 'active' | 'expiring' | 'expired'

export interface Gym {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface Member {
  id: string
  gym_id: string
  member_number: number
  legacy_member_id?: string | null
  name: string
  phone: string
  gender?: 'male' | 'female' | 'other' | null
  age?: number | null
  area?: string | null
  pending_amount: number
  created_at: string
}

/** Formats a member_number integer as the GF-prefixed ID string, e.g. 1 → "GF0001" */
export function formatMemberId(num: number | null | undefined): string {
  if (num == null) return '—'
  return 'GF' + String(num).padStart(4, '0')
}

/** Parses a GF-prefixed ID string back to an integer, e.g. "GF0042" → 42 */
export function parseMemberId(raw: string): number | null {
  const trimmed = raw.trim().toUpperCase()
  // Strip GF prefix if present
  const digits = trimmed.startsWith('GF') ? trimmed.slice(2) : trimmed
  const num = parseInt(digits, 10)
  return isNaN(num) ? null : num
}

export interface Membership {
  id: string
  member_id: string
  gym_id: string
  plan: Plan
  category?: 'strength' | 'cardio' | 'both'
  start_date: string
  end_date: string
  amount: number
  admission_fee: number
  payment_mode: PaymentMode
  created_at: string
  // joined from members
  member?: Member
}

export interface Attendance {
  id: string
  member_id: string
  gym_id: string
  date: string
  session: 'morning' | 'evening'
  created_at: string
  check_out_time?: string | null
  member?: Member
}

export interface MemberWithStatus extends Member {
  latest_membership: Membership | null
  status: MemberStatus
  days_remaining: number
  join_date?: string
}

export interface DashboardStats {
  total_active: number
  expiring_this_week: number
  expired_count: number
  today_attendance: number
  total_dues: number
  today_collection: number
}
