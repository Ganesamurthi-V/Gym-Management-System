export type Plan = 'monthly' | 'quarterly' | 'annual'
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
  name: string
  phone: string
  created_at: string
}

export interface Membership {
  id: string
  member_id: string
  gym_id: string
  plan: Plan
  start_date: string
  end_date: string
  amount: number
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
  created_at: string
  member?: Member
}

export interface MemberWithStatus extends Member {
  latest_membership: Membership | null
  status: MemberStatus
  days_remaining: number
}

export interface DashboardStats {
  total_active: number
  expiring_this_week: number
  expired_count: number
  today_attendance: number
}
