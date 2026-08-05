/**
 * lib/member-data.ts
 *
 * Server-only data helpers for the member PWA.
 * All queries run in the authenticated member's session (anon key + cookies).
 * RLS policies ensure each member can only read their own rows.
 *
 * NEVER import this file from a 'use client' component.
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Member, Gym, Membership, Attendance, WorkoutProgram } from '@/types/database'

// ─── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Returns the authenticated Supabase user or redirects to login.
 * Used as the first call in every server page.
 */
export async function requireMemberSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return { supabase, user }
}

// ─── Core member + gym ───────────────────────────────────────────────────────

export type MemberWithGym = {
  member: Member
  gym: Gym
}

/**
 * Returns the logged-in member's own row and their gym's branding info.
 * Redirects to login if the session is missing or not linked to a member.
 */
export async function getMemberWithGym(): Promise<MemberWithGym> {
  const { supabase, user } = await requireMemberSession()

  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (memberErr || !member) redirect('/auth/login')

  const { data: gym, error: gymErr } = await supabase
    .from('gyms')
    .select('id, name, city, phone, created_at')
    .eq('id', member.gym_id)
    .single()

  if (gymErr || !gym) redirect('/auth/login')

  return { member: member as Member, gym: gym as Gym }
}

// ─── Membership status helpers ───────────────────────────────────────────────

export type MembershipStatus = 'active' | 'expiring' | 'expired' | 'none'

export interface MembershipState {
  status: MembershipStatus
  daysLeft: number | null
  latest: Membership | null
}

export function computeMembershipState(memberships: Membership[]): MembershipState {
  if (memberships.length === 0) return { status: 'none', daysLeft: null, latest: null }

  const latest = memberships[0]
  const now = new Date()
  const endDate = new Date(latest.end_date + 'T23:59:59')
  const diffMs = endDate.getTime() - now.getTime()
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  let status: MembershipStatus = 'active'
  if (daysLeft < 0) status = 'expired'
  else if (daysLeft <= 7) status = 'expiring'

  return { status, daysLeft: Math.max(0, daysLeft), latest }
}

// ─── Memberships ─────────────────────────────────────────────────────────────

/**
 * Returns all memberships for the logged-in member, newest first.
 */
export async function getMemberMemberships(memberId: string): Promise<Membership[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('id, member_id, gym_id, plan, category, start_date, end_date, amount, admission_fee, due_amount, payment_mode, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as Membership[]
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceSummary {
  records: Attendance[]
  thisMonthCount: number
  thisWeekCount: number
  totalCount: number
  /** Dates with at least one check-in as YYYY-MM-DD strings */
  checkedInDates: Set<string>
}

/**
 * Returns recent attendance for the member (last 6 months) plus summary stats.
 */
export async function getMemberAttendance(memberId: string): Promise<AttendanceSummary> {
  const supabase = await createClient()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data, error } = await supabase
    .from('attendance')
    .select('id, member_id, gym_id, date, session, check_out_time, created_at')
    .eq('member_id', memberId)
    .gte('date', sixMonthsAgo.toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(300)

  const records = (error ? [] : data ?? []) as Attendance[]

  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  let thisWeekCount = 0
  let thisMonthCount = 0
  const checkedInDates = new Set<string>()

  for (const r of records) {
    checkedInDates.add(r.date)
    const d = new Date(r.date)
    if (d >= startOfMonth) thisMonthCount++
    if (d >= startOfWeek) thisWeekCount++
  }

  return {
    records,
    thisMonthCount,
    thisWeekCount,
    totalCount: records.length,
    checkedInDates,
  }
}

// ─── Workout programs ─────────────────────────────────────────────────────────

/**
 * Returns published workout programs for the member's gym.
 */
export async function getGymWorkoutPrograms(gymId: string): Promise<WorkoutProgram[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workout_programs')
    .select('id, gym_id, name, summary, notes, duration, frequency, difficulty, goal, category, equipment, target_audience, experience_level, schedule, is_draft, created_at, updated_at')
    .eq('gym_id', gymId)
    .eq('is_draft', false)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as WorkoutProgram[]
}

// ─── Login event ──────────────────────────────────────────────────────────────

/**
 * Stamps last_portal_login and logs a logged_in activity event.
 * Call once per session from the home page server component.
 * Errors are swallowed — this must never block page render.
 */
export async function recordMemberLogin(memberId: string, gymId: string): Promise<void> {
  try {
    const supabase = await createClient()
    // Use the SECURITY DEFINER function from the migration
    await supabase.rpc('record_member_login', { p_member_id: memberId })

    // Log activity — uses the member self-insert policy
    await supabase.from('member_portal_activity').insert({
      gym_id: gymId,
      member_id: memberId,
      activity: 'logged_in',
      performed_by: 'member',
    })
  } catch {
    // Non-fatal
  }
}

// ─── Re-export pure formatters so server pages don't need a separate import ──
export { formatPlan, formatDate, formatDateShort, formatCurrency } from '@/lib/member-utils'
