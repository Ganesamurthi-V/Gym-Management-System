export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ─── members ─────────────────────────────────────────────────────────────────
type MembersRow = {
  id: string
  gym_id: string
  auth_user_id: string | null
  member_number: number
  member_code: string | null
  name: string
  phone: string
  email: string | null
  photo_url: string | null
  gender: 'male' | 'female' | 'other' | null
  area: string | null
  age: number | null
  date_of_birth: string | null
  blood_group: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | null
  emergency_name: string | null
  emergency_phone: string | null
  medical_notes: string | null
  pending_amount: number
  legacy_member_id: string | null
  is_imported: boolean
  // Portal management columns (20260729 migration)
  portal_enabled: boolean
  portal_suspended: boolean
  invitation_status: 'not_sent' | 'pending' | 'delivered' | 'activated' | 'expired'
  invitation_sent_at: string | null
  portal_activated_at: string | null
  last_portal_login: string | null
  created_at: string
}

// ─── gyms ─────────────────────────────────────────────────────────────────────
// NOTE: the live `gyms` table has NO `city` / `phone` columns — it stores a
// single free-text `location`. Selecting non-existent columns makes PostgREST
// fail the whole request with 42703, so only real columns may be listed here.
type GymsRow = {
  id: string
  name: string
  location: string | null
  created_at: string
}

// ─── memberships ─────────────────────────────────────────────────────────────
type MembershipsRow = {
  id: string
  member_id: string
  gym_id: string
  plan: 'monthly' | 'quarterly' | 'annual'
  category: 'strength' | 'cardio' | 'both' | null
  start_date: string   // ISO date YYYY-MM-DD
  end_date: string     // ISO date YYYY-MM-DD
  amount: number
  admission_fee: number
  due_amount: number
  payment_mode: 'cash' | 'upi' | 'card'
  created_at: string
}

// ─── attendance ───────────────────────────────────────────────────────────────
type AttendanceRow = {
  id: string
  member_id: string
  gym_id: string
  date: string         // ISO date YYYY-MM-DD
  session: 'morning' | 'evening' | null
  check_out_time: string | null
  created_at: string
}

// ─── workout_programs ─────────────────────────────────────────────────────────
type WorkoutProgramsRow = {
  id: string
  gym_id: string
  name: string
  summary: string | null
  notes: string | null
  duration: number
  frequency: number | null
  difficulty: string | null
  goal: string | null
  category: string | null
  equipment: string | null
  target_audience: string | null
  experience_level: string | null
  schedule: Json
  is_draft: boolean
  created_at: string
  updated_at: string
}

// ─── member_portal_activity ───────────────────────────────────────────────────
type MemberPortalActivityRow = {
  id: string
  gym_id: string
  member_id: string
  activity: 'portal_activated' | 'logged_in' | 'password_reset'
    | 'membership_renewed' | 'membership_expired'
    | 'invitation_resent' | 'portal_disabled' | 'portal_enabled'
  performed_by: string
  created_at: string
}

// ─── Database type ────────────────────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      members: {
        Row: MembersRow
        Insert: Omit<MembersRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<MembersRow, 'id' | 'created_at'>>
        Relationships: []
      }
      gyms: {
        Row: GymsRow
        Insert: Omit<GymsRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<GymsRow, 'id' | 'created_at'>>
        Relationships: []
      }
      memberships: {
        Row: MembershipsRow
        Insert: Omit<MembershipsRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<MembershipsRow, 'id' | 'created_at'>>
        Relationships: []
      }
      attendance: {
        Row: AttendanceRow
        Insert: Omit<AttendanceRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<AttendanceRow, 'id' | 'created_at'>>
        Relationships: []
      }
      workout_programs: {
        Row: WorkoutProgramsRow
        Insert: Omit<WorkoutProgramsRow, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<WorkoutProgramsRow, 'id' | 'created_at'>>
        Relationships: []
      }
      member_portal_activity: {
        Row: MemberPortalActivityRow
        Insert: Omit<MemberPortalActivityRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      current_member_gym_id: {
        Args: Record<never, never>
        Returns: string
      }
      record_member_login: {
        Args: { p_member_id: string }
        Returns: void
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Member = MembersRow
export type Gym = GymsRow
export type Membership = MembershipsRow
export type Attendance = AttendanceRow
export type WorkoutProgram = WorkoutProgramsRow
export type MemberPortalActivity = MemberPortalActivityRow
