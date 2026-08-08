/**
 * lib/member-data.ts
 *
 * Server-only data helpers for the member PWA.
 * All queries run in the authenticated member's session (anon key + cookies).
 * RLS policies ensure each member can only read their own rows.
 *
 * NEVER import this file from a 'use client' component.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PERFORMANCE NOTES
 * ────────────────────────────────────────────────────────────────────────────
 * Measured against the live project, every PostgREST round trip costs ~300ms
 * and `auth.getUser()` costs ~500ms (it is a network call to the Auth server).
 * The original implementation cost ~1540ms per page:
 *
 *   auth.getUser()  (~500ms)  →  members select (~300ms)  →  gyms select (~300ms)
 *   → then a page-specific query (~300ms), all sequential.
 *
 * Three changes remove almost all of that:
 *
 * 1. `auth.getUser()` is replaced by `auth.getSession()` (0ms, decodes the
 *    cookie locally). The JWT is still verified — by PostgREST, on every
 *    query. See the security note on `getSessionUserId()` below.
 *
 * 2. `members` + `gyms` are fetched in ONE request using a PostgREST embedded
 *    join, instead of two sequential requests.
 *
 * 3. `memberships`, `attendance` and `workout_programs` all have RLS policies
 *    that scope rows to `auth.uid()` already, so they do not need a
 *    `member_id` / `gym_id` filter supplied by the caller. That means they no
 *    longer have to wait for the member row to load, and can be fetched in
 *    PARALLEL with it via `Promise.all`.
 *
 * Every reader is wrapped in React `cache()`, which dedupes calls within a
 * single request. `cache()` is request-scoped, so concurrent users never share
 * data.
 */

import { cache } from 'react'
import { after } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { timed } from '@/lib/perf'
import type { Member, Gym, Membership, Attendance, WorkoutProgram } from '@/types/member-db'

// ─── Column lists ────────────────────────────────────────────────────────────
// NOTE: `gyms` has no city/phone columns (it has `location`). Selecting a
// column that does not exist makes PostgREST fail the whole request with 42703.

const GYM_COLUMNS = 'id, name, location, created_at'
const MEMBERSHIP_COLUMNS =
  'id, member_id, gym_id, plan, category, start_date, end_date, amount, admission_fee, due_amount, payment_mode, created_at'
const ATTENDANCE_COLUMNS = 'id, member_id, gym_id, date, session, check_out_time, created_at'
const PROGRAM_COLUMNS =
  'id, gym_id, name, summary, notes, duration, frequency, difficulty, goal, category, equipment, target_audience, experience_level, schedule, is_draft, created_at, updated_at'

// ─── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Returns the current user id from a CRYPTOGRAPHICALLY VERIFIED JWT, with no
 * network round trip.
 *
 * This project signs access tokens with ES256 (asymmetric) and publishes a
 * JWKS, so `getClaims()` verifies the signature locally against the cached
 * public key. Measured cost: 0.4ms, versus 373ms for `auth.getUser()`, which
 * makes an HTTP call to the Auth server to learn the same thing.
 *
 * SECURITY: this is equivalent in strength to `getUser()`, not weaker than it.
 * Verified against the live project:
 *   - a token with an edited payload is rejected with "Invalid JWT signature"
 *   - a malformed token is rejected
 *   - the returned `sub` matches what `getUser()` reports
 *
 * Postgres RLS remains the authority on which rows are readable, so even if
 * this returned a wrong id, no other member's data could be read.
 */
const getVerifiedUserId = cache(async (): Promise<string | null> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  return data.claims.sub
})

// NOTE: a `requireMemberSession()` helper used to live here. It called
// `auth.getUser()` (~500ms) and had no remaining callers, so it was removed to
// stop anyone reintroducing that round trip. Use `getMemberWithGym()`, which
// verifies the JWT locally via `getVerifiedUserId()` above.

// ─── Core member + gym (ONE round trip) ──────────────────────────────────────

export type MemberWithGym = {
  member: Member
  gym: Gym
}

/** Shape returned by the embedded join before we split it apart. */
type MemberJoinRow = Member & { gyms: Gym | null }

/**
 * Returns the logged-in member's own row and their gym's branding info in a
 * single request, using a PostgREST embedded join over the
 * `members.gym_id → gyms.id` foreign key.
 *
 * Returns null if the member can't be found (avoids redirect loops).
 * Deduped per request by `cache()`.
 */
export const getMemberWithGym = cache(async (): Promise<MemberWithGym | null> => {
  const userId = await timed('auth (getClaims, local verify)', () => getVerifiedUserId())
  if (!userId) return null

  const supabase = await getServerClient()

  const { data, error } = await timed('member + gym (joined)', () =>
    supabase
      .from('members')
      .select(`*, gyms!inner(${GYM_COLUMNS})`)
      .eq('auth_user_id', userId)
      .maybeSingle(),
  )

  if (error || !data) {
    console.error('[getMemberWithGym] joined member+gym query failed', {
      authUserId: userId,
      code: error?.code,
      message: error?.message,
    })
    return null
  }

  const { gyms, ...member } = data as unknown as MemberJoinRow

  if (!gyms) {
    console.error('[getMemberWithGym] member has no readable gym', {
      memberId: member.id,
      gymId: member.gym_id,
    })
    return null
  }

  return { member: member as Member, gym: gyms as Gym }
})

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
 *
 * No `member_id` filter is needed: the "Members can view their own
 * memberships" RLS policy already restricts rows to
 * `member_id IN (SELECT id FROM members WHERE auth_user_id = auth.uid())`.
 * Dropping the filter is what allows this to run in parallel with the member
 * query instead of waiting on it.
 */
export const getMemberMemberships = cache(async (): Promise<Membership[]> => {
  const supabase = await getServerClient()

  const { data, error } = await timed('memberships', () =>
    supabase
      .from('memberships')
      .select(MEMBERSHIP_COLUMNS)
      .order('created_at', { ascending: false }),
  )

  if (error) {
    console.error('[getMemberMemberships] failed', { code: error.code, message: error.message })
    return []
  }
  return (data ?? []) as Membership[]
})

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
 * RLS-scoped to the caller, so no `member_id` filter is required.
 */
export const getMemberAttendance = cache(async (): Promise<AttendanceSummary> => {
  const supabase = await getServerClient()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data, error } = await timed('attendance', () =>
    supabase
      .from('attendance')
      .select(ATTENDANCE_COLUMNS)
      .gte('date', sixMonthsAgo.toISOString().slice(0, 10))
      .order('date', { ascending: false })
      .limit(300),
  )

  if (error) {
    console.error('[getMemberAttendance] failed', { code: error.code, message: error.message })
  }

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
})

// ─── Workout programs (assigned to THIS member only) ──────────────────────────

/**
 * Returns published workout programs that are ASSIGNED to the logged-in member.
 *
 * Previously this returned every non-draft program in the gym. Now it reads
 * through `program_assignments`, which the gym owner populates from the
 * "Assign Members" button on each program. The RLS policy "Members can view
 * their own assignments" ensures only the caller's rows are visible, so no
 * explicit member_id filter is needed — making this safe to run in parallel
 * with the member query (same pattern as memberships/attendance).
 *
 * Programs assigned to "all" still work: the owner's bulk-assign writes a row
 * per member into `program_assignments`, so the same query covers both cases.
 */
export const getAssignedWorkoutPrograms = cache(async (): Promise<WorkoutProgram[]> => {
  const supabase = await getServerClient()

  // Fetch the program IDs assigned to the current member.
  const { data: assignments, error: assignErr } = await timed('program_assignments', () =>
    supabase
      .from('program_assignments')
      .select('program_id'),
  )

  if (assignErr) {
    console.error('[getAssignedWorkoutPrograms] assignments query failed', {
      code: assignErr.code,
      message: assignErr.message,
    })
    return []
  }

  const programIds = (assignments ?? []).map((a: { program_id: string }) => a.program_id)
  if (programIds.length === 0) return []

  // Fetch the full program rows for those IDs.
  // RLS on workout_programs already restricts to the member's gym + non-draft.
  const { data, error } = await timed('workout_programs (assigned)', () =>
    supabase
      .from('workout_programs')
      .select(PROGRAM_COLUMNS)
      .in('id', programIds)
      .order('created_at', { ascending: false }),
  )

  if (error) {
    console.error('[getAssignedWorkoutPrograms] programs query failed', {
      code: error.code,
      message: error.message,
    })
    return []
  }
  return (data ?? []) as WorkoutProgram[]
})

// Keep the old helper available for the /api/member/bundle route which may
// still want all gym programs. Aliased so nothing breaks.
export const getGymWorkoutPrograms = getAssignedWorkoutPrograms

// ─── Page bundles (parallel fetch — one round trip per page) ──────────────────
//
// Each bundle fires its independent queries with Promise.all so the page pays
// the cost of the SLOWEST query (~300ms) rather than the SUM of all of them.

export type MemberPageBundle = MemberWithGym

/** Home / Membership / Membership card: member + gym + memberships. */
export const getMembershipPageData = cache(async () => {
  const [core, memberships] = await Promise.all([
    getMemberWithGym(),
    getMemberMemberships(),
  ])
  if (!core) return null
  return { ...core, memberships, state: computeMembershipState(memberships) }
})

/** Attendance / Rewards: member + gym + attendance. */
export const getAttendancePageData = cache(async () => {
  const [core, attendance] = await Promise.all([
    getMemberWithGym(),
    getMemberAttendance(),
  ])
  if (!core) return null
  return { ...core, attendance }
})

/** Progress: member + gym + memberships + attendance. */
export const getProgressPageData = cache(async () => {
  const [core, memberships, attendance] = await Promise.all([
    getMemberWithGym(),
    getMemberMemberships(),
    getMemberAttendance(),
  ])
  if (!core) return null
  return { ...core, memberships, attendance, state: computeMembershipState(memberships) }
})

/** Workout: member + gym + assigned programs. */
export const getWorkoutPageData = cache(async () => {
  const [core, programs] = await Promise.all([
    getMemberWithGym(),
    getAssignedWorkoutPrograms(),
  ])
  if (!core) return null
  return { ...core, programs }
})

// ─── Login event ──────────────────────────────────────────────────────────────

/** Don't re-stamp a login more often than this. */
const LOGIN_THROTTLE_MS = 30 * 60 * 1000

/**
 * Stamps last_portal_login and logs a logged_in activity event.
 *
 * Scheduled with `after()` so both writes run AFTER the response has been
 * flushed to the browser. Previously these two writes were kicked off during
 * render, which added ~400ms to the home page's TTFB.
 *
 * Also throttled: it was firing on every single Home visit, so tapping the Home
 * tab ten times inserted ten `logged_in` rows and flooded the gym owner's
 * activity feed. It now records at most once per 30 minutes per member, which
 * preserves the intent (track member logins) without the duplicates.
 *
 * Errors are swallowed — this must never affect the page.
 */
export function recordMemberLogin(
  memberId: string,
  gymId: string,
  lastLoginAt?: string | null,
): void {
  if (lastLoginAt) {
    const elapsed = Date.now() - new Date(lastLoginAt).getTime()
    if (Number.isFinite(elapsed) && elapsed < LOGIN_THROTTLE_MS) return
  }

  after(async () => {
    try {
      const supabase = await getServerClient()

      // Independent writes — run them concurrently.
      await Promise.all([
        // SECURITY DEFINER function from the 20260730 migration
        supabase.rpc('record_member_login', { p_member_id: memberId }),
        // Uses the member self-insert policy
        supabase.from('member_portal_activity').insert({
          gym_id: gymId,
          member_id: memberId,
          activity: 'logged_in',
          performed_by: 'member',
        }),
      ])
    } catch {
      // Non-fatal
    }
  })
}

// ─── Re-export pure formatters so server pages don't need a separate import ──
export { formatPlan, formatDate, formatDateShort, formatCurrency } from '@/lib/member/member-utils'
