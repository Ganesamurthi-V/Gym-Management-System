import { describe, it, expect, vi, beforeEach } from 'vitest'

// gyms.owner_id is unique. Two concurrent onboarding calls both see "no gym", the second insert
// fails with 23505; that must continue as an update on the winner's gym, not return a 500.

const h = vi.hoisted(() => ({
  updated: [] as string[],
  inserts: 0,
  lapsed: false,
  reselect: { data: { id: 'gym-1' } as { id: string } | null, error: null as unknown },
}))

vi.mock('@/lib/logger', () => {
  const l = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: () => l }
  return { logger: l }
})
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }), ROUTE_LIMITS: { DEFAULT: 10 } }))
vi.mock('@/lib/auth/roles', () => ({ roleFromClaims: () => 'owner' }))
vi.mock('@/lib/auth/phone', () => ({ ownerMobileFromUser: () => '9876543210' }))
// The guard has its own query (which would shift the lookup counter below), so it is stubbed.
vi.mock('@/lib/subscriptionGuard', async () => {
  const { NextResponse } = await import('next/server')
  return {
    assertGymWritableById: async () => h.lapsed
      ? NextResponse.json({ success: false, error: { code: 'SUBSCRIPTION_REQUIRED', message: 'ended' } }, { status: 403 })
      : null,
  }
})
vi.mock('@/app/api/_guard', () => ({ passesCsrf: () => true }))

// Lookup (select by owner_id) finds nothing the first time; after the failed insert it finds the gym.
vi.mock('@/lib/supabase/server', () => {
  let selects = 0
  return {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => (selects++ === 0 ? { data: null, error: null } : h.reselect) }) }),
        insert: () => { h.inserts++; return { select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) } },
        update: () => ({ eq: (_c: string, id: string) => { h.updated.push(id); return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id }, error: null }) }) }) } } }),
        upsert: async () => ({ error: null }),
      }),
    }),
  }
})

const req = () => ({
  json: async () => ({ gymName: 'Iron Gym', gymType: 'Gym', branchCount: 1, openingYear: 2020, phone: '', city: '', address: '', plans: [] }),
  headers: new Headers(),
}) as never

describe('onboarding/complete unique-owner race', () => {
  beforeEach(() => { h.updated.length = 0; h.inserts = 0; h.lapsed = false; h.reselect = { data: { id: 'gym-1' }, error: null }; vi.resetModules() })

  it('treats 23505 as "gym already exists": re-selects by owner and updates it', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route')
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect((await res.json()).data.gymId).toBe('gym-1')
    expect(h.inserts).toBe(1)
    expect(h.updated).toEqual(['gym-1'])
  })

  it('still reports a database error when the gym cannot be re-selected', async () => {
    h.reselect = { data: null, error: null }
    const { POST } = await import('@/app/api/onboarding/complete/route')
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(h.updated).toEqual([])
  })

  it('refuses 403 SUBSCRIPTION_REQUIRED for a lapsed gym and writes nothing', async () => {
    h.lapsed = true
    h.reselect = { data: { id: 'gym-1' }, error: null }
    const { POST } = await import('@/app/api/onboarding/complete/route')
    const res = await POST({ ...(req() as object), json: async () => ({ gymId: '11111111-1111-4111-8111-111111111111', gymName: 'Iron Gym', gymType: 'Gym', branchCount: 1, openingYear: 2020, plans: [] }) } as never)
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('SUBSCRIPTION_REQUIRED')
    expect(h.updated).toEqual([])
  })
})
