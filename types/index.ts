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
  /** ISO date "YYYY-MM-DD". Drives the birthday_wishes WhatsApp automation. */
  date_of_birth?: string | null
  area?: string | null
  pending_amount: number
  created_at: string
  /** True for members created via Excel/CSV import — suppresses the welcome template. */
  is_imported?: boolean | null
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

/** Day keys used by the workout program schedule JSONB column. */
export type ProgramDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export interface ProgramExercise {
  id: string
  name: string
  type: string
  target: string
  notes: string
  /** Per-week set definitions, keyed by week number (1-based). */
  progressions: Record<number, Record<string, string>[]>
}

/** Every day key is always present; a rest day is an empty array. */
export type ProgramSchedule = Record<ProgramDay, ProgramExercise[]>

export interface WorkoutProgram {
  id: string
  gym_id: string
  name: string
  summary: string | null
  notes: string | null
  /** Program length in weeks. */
  duration: number
  /** Training days per week. */
  frequency: number | null
  difficulty: string | null
  goal: string | null
  category: string | null
  equipment: string | null
  target_audience: string | null
  experience_level: string | null
  schedule: ProgramSchedule
  is_draft: boolean
  created_at: string
  updated_at: string
}

/** Columns selected for the programs list view. */
export type WorkoutProgramSummary = Pick<
  WorkoutProgram,
  'id' | 'name' | 'summary' | 'duration' | 'frequency' | 'difficulty' | 'goal' | 'category' | 'is_draft' | 'created_at'
>

export interface DashboardStats {
  total_active: number
  expiring_this_week: number
  expired_count: number
  today_attendance: number
  total_dues: number
  today_collection: number
}
