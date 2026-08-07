'use client'

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Member, Gym, Membership, Attendance, WorkoutProgram } from '@/types/database'
import type { MembershipState } from '@/lib/member-data'

/**
 * Client-side cached access to the member's data.
 *
 * Backed by `GET /api/member/bundle`, which enforces auth + RLS server-side.
 * Nothing here trusts client input: the route derives the member from the
 * session cookie, so these hooks cannot be pointed at another member.
 */

export type MemberBundle = {
  member: Member
  gym: Gym
  memberships: Membership[]
  membershipState: MembershipState
  attendance: {
    records: Attendance[]
    thisMonthCount: number
    thisWeekCount: number
    totalCount: number
    checkedInDates: string[]
  }
  programs: WorkoutProgram[]
  fetchedAt: string
}

export const memberKeys = {
  bundle: ['member', 'bundle'] as const,
}

async function fetchMemberBundle(signal?: AbortSignal): Promise<MemberBundle> {
  const res = await fetch('/api/member/bundle', {
    signal,
    // Per-user data: never read from or write to the HTTP cache.
    cache: 'no-store',
    credentials: 'same-origin',
  })

  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Not signed in' : `Failed to load member data (${res.status})`)
  }
  return res.json()
}

/** Full member bundle, cached in memory for the life of the tab. */
export function useMemberBundle() {
  return useQuery({
    queryKey: memberKeys.bundle,
    queryFn: ({ signal }) => fetchMemberBundle(signal),
  })
}

/** Member profile + gym only. */
export function useMemberProfile() {
  const query = useMemberBundle()
  return {
    ...query,
    data: query.data ? { member: query.data.member, gym: query.data.gym } : undefined,
  }
}

/** Memberships plus the derived active/expiring/expired state. */
export function useMemberships() {
  const query = useMemberBundle()
  return {
    ...query,
    data: query.data
      ? { memberships: query.data.memberships, state: query.data.membershipState }
      : undefined,
  }
}

/** Attendance records and the progress counters derived from them. */
export function useAttendance() {
  const query = useMemberBundle()
  return { ...query, data: query.data?.attendance }
}

/** Published workout programs for the member's gym. */
export function useWorkouts() {
  const query = useMemberBundle()
  return { ...query, data: query.data?.programs }
}

/**
 * Warms the bundle into the cache without subscribing a component to it.
 * Used by `MemberDataWarmer` on app start.
 */
export function prefetchMemberBundle(client: QueryClient) {
  return client.prefetchQuery({
    queryKey: memberKeys.bundle,
    queryFn: ({ signal }) => fetchMemberBundle(signal),
  })
}

/** Forces a refresh, e.g. after a check-in or a membership renewal. */
export function useInvalidateMemberBundle() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: memberKeys.bundle })
}
