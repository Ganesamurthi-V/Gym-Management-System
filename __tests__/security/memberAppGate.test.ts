import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression: the Free-plan member-app gate lived only in app/m/layout.tsx. Layouts and pages
// render in parallel and client-side navigation skips the layout, so pages, API routes and server
// actions must be gated by the loader itself (getMemberWithGym) or by getMemberAccessState().

const state = vi.hoisted(() => ({
  planType: 'free' as string,
  memberRow: { id: 'm1', gym_id: 'g1', created_at: '2026-01-01', name: 'A' } as unknown,
  access: { state: 'ok', data: { member: { id: 'm1' }, gym: { id: 'g1' } } } as
    | { state: 'ok'; data: unknown } | { state: 'blocked' } | { state: 'not_member' },
  user: { id: 'u1' } as unknown,
  role: 'member',
  rpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
// React's request-scoped cache() does not exist outside an RSC render; a passthrough keeps each call fresh.
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }))
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: vi.fn() }))
vi.mock('@/lib/perf', () => ({ timed: (_l: string, fn: () => unknown) => fn(), startPageTimer: () => () => {} }))
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: 'u1' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.memberRow, error: null }) }) }) }),
    rpc: () => ({ maybeSingle: async () => ({ data: { id: 'g1', name: 'Gym' }, error: null }) }),
  }),
  createClient: async () => ({ rpc: state.rpc, from: () => ({ select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan_type: state.planType }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/dal', () => ({ getAuthUser: async () => ({ user: state.user }) }))
vi.mock('@/lib/auth/roles', () => ({ roleFromClaims: () => state.role }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/logger', () => ({ apiLogger: () => ({ summary: () => {}, error: () => {} }) }))

describe('getMemberWithGym plan gate', () => {
  beforeEach(() => { state.planType = 'free' })

  it('returns null for a member on the Free plan, while the unchecked loader still finds them', async () => {
    const md = await import('@/lib/member/member-data')
    expect(await md.getMemberWithGymUnchecked()).not.toBeNull()
    expect(await md.getMemberWithGym()).toBeNull()
    expect((await md.getMemberAccessState()).state).toBe('blocked')
  })

  it('returns the member on a paid plan', async () => {
    state.planType = 'pro'
    const md = await import('@/lib/member/member-data')
    expect((await md.getMemberAccessState()).state).toBe('ok')
    expect(await md.getMemberWithGym()).not.toBeNull()
  })

  it('reports not_member when there is no member row', async () => {
    state.memberRow = null
    const md = await import('@/lib/member/member-data')
    expect((await md.getMemberAccessState()).state).toBe('not_member')
    state.memberRow = { id: 'm1', gym_id: 'g1', created_at: '2026-01-01', name: 'A' }
  })
})

describe('member routes', () => {
  beforeEach(() => {
    vi.resetModules()
    state.user = { id: 'u1' }
    state.role = 'member'
    state.rpc.mockReset()
    state.rpc.mockResolvedValue({ data: [], error: null })
    vi.doMock('@/lib/member/member-data', () => ({
      getMemberAccessState: async () => state.access,
      getMemberMemberships: async () => [],
      getMemberAttendance: async () => ({ records: [], thisMonthCount: 0, thisWeekCount: 0, totalCount: 0, checkedInDates: new Set() }),
      getGymWorkoutPrograms: async () => [],
      computeMembershipState: () => ({ status: 'none', daysLeft: null, latest: null }),
    }))
  })

  it('bundle: 403 PLAN_NOT_ALLOWED for a blocked member', async () => {
    state.access = { state: 'blocked' }
    const { GET } = await import('@/app/api/member/bundle/route')
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('PLAN_NOT_ALLOWED')
  })

  it('bundle: 401 for a non-member, 200 for an allowed member', async () => {
    const { GET } = await import('@/app/api/member/bundle/route')
    state.access = { state: 'not_member' }
    expect((await GET()).status).toBe(401)
    state.access = { state: 'ok', data: { member: { id: 'm1' }, gym: { id: 'g1' } } }
    expect((await GET()).status).toBe(200)
  })

  it('leaderboard: blocked member gets 403 and the RPC never runs', async () => {
    state.access = { state: 'blocked' }
    const { GET } = await import('@/app/api/gamification/leaderboard/route')
    const res = await GET({ nextUrl: new URL('http://x/api/gamification/leaderboard?board=week') } as never)
    expect(res.status).toBe(403)
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('leaderboard: owners are not gated', async () => {
    state.role = 'owner'
    state.access = { state: 'not_member' }
    const { GET } = await import('@/app/api/gamification/leaderboard/route')
    const res = await GET({ nextUrl: new URL('http://x/api/gamification/leaderboard?board=week') } as never)
    expect(res.status).toBe(200)
    expect(state.rpc).toHaveBeenCalled()
  })

  it('member-events: blocked member gets 403 and the RPC never runs', async () => {
    state.access = { state: 'blocked' }
    const { GET } = await import('@/app/api/gamification/member-events/route')
    const res = await GET()
    expect(res.status).toBe(403)
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('setLeaderboardVisibility: blocked member is refused before the RPC', async () => {
    state.access = { state: 'blocked' }
    vi.doMock('@/lib/supabase/server', () => ({ getServerClient: async () => ({ rpc: state.rpc }) }))
    const { setLeaderboardVisibility } = await import('@/app/m/profile/actions')
    const res = await setLeaderboardVisibility(true)
    expect(res.success).toBe(false)
    expect(state.rpc).not.toHaveBeenCalled()
  })
})
