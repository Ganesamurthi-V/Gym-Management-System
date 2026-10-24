import { NextResponse } from 'next/server'
import {
  getMemberAccessState,
  getMemberMemberships,
  getMemberAttendance,
  getGymWorkoutPrograms,
  computeMembershipState,
} from '@/lib/member/member-data'

/**
 * GET /api/member/bundle
 *
 * Serves the signed-in member's full dataset as JSON so client components can
 * read and cache it (TanStack Query) without triggering a server navigation.
 *
 * SECURITY
 * - Uses the cookie-scoped Supabase client, so every query runs as the calling
 *   member and Postgres RLS restricts rows to `auth.uid()`. No service-role key
 *   is involved and no row filter is accepted from the client, so this route
 *   cannot be used to read another member's data.
 * - Responds 401 when the caller is not a linked member, and 403 PLAN_NOT_ALLOWED when their
 *   gym's plan has no member app (Free after the trial).
 * - `Cache-Control: no-store` — this is per-user data and must never be held by
 *   a CDN, proxy, or the browser's HTTP cache. In-memory caching is handled by
 *   TanStack Query on the client, which is scoped to the tab.
 */

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Vary': 'Cookie',
} as const

export async function GET() {
  // All four queries are independent and RLS-scoped, so they run concurrently:
  // the route costs one round trip (~250ms) rather than four (~1s). Awaiting
  // the member row first would have split this into two serial phases.
  // Read-only fetches stay parallel; their results are discarded unless access is 'ok'.
  const [access, memberships, attendance, programs] = await Promise.all([
    getMemberAccessState(),
    getMemberMemberships(),
    getMemberAttendance(),
    getGymWorkoutPrograms(),
  ])

  if (access.state === 'blocked') {
    return NextResponse.json(
      { error: { code: 'PLAN_NOT_ALLOWED', message: "The member app is not available on your gym's plan." } },
      { status: 403, headers: NO_STORE },
    )
  }
  if (access.state !== 'ok') {
    return NextResponse.json(
      { error: 'unauthorized', message: 'No member session.' },
      { status: 401, headers: NO_STORE },
    )
  }
  const core = access.data

  return NextResponse.json(
    {
      member: core.member,
      gym: core.gym,
      memberships,
      membershipState: computeMembershipState(memberships),
      attendance: {
        records: attendance.records,
        thisMonthCount: attendance.thisMonthCount,
        thisWeekCount: attendance.thisWeekCount,
        totalCount: attendance.totalCount,
        // Set is not JSON-serialisable — send as an array.
        checkedInDates: [...attendance.checkedInDates],
      },
      programs,
      fetchedAt: new Date().toISOString(),
    },
    { headers: NO_STORE },
  )
}
