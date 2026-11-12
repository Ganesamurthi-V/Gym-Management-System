import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// A lapsed or deactivated gym is read-only on the server: the UI paywall is skipped by a direct
// API call, so withAuth refuses every method itself. Billing, account and support routes opt out.

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  gym: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/supabase/queries', () => ({ getGymForUser: async () => m.gym }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }), ROUTE_LIMITS: { DEFAULT: 60 } }))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: () => {} }))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {} }),
}))

import { withAuth } from '@/lib/api/withAuth'
import { assertGymWritable, assertGymWritableById } from '@/lib/subscriptionGuard'

const req = (method: string) =>
  new NextRequest('http://localhost/api/x', { method, headers: { 'x-requested-with': 'XMLHttpRequest' } })
const ok = async () => NextResponse.json({ success: true })

const PAST = '2020-01-01T00:00:00.000Z'
const FUTURE = '2999-01-01T00:00:00.000Z'
const gym = (extra: Record<string, unknown>) => ({ id: 'g1', name: 'G', ...extra })

beforeEach(() => { m.gym = null })

describe('withAuth read-only mode', () => {
  it('refuses a POST on an expired gym with 403 SUBSCRIPTION_REQUIRED', async () => {
    m.gym = gym({ is_active: true, subscription_status: 'expired', plan_type: 'monthly', subscription_ends_at: PAST })
    const res = await withAuth('T', ok)(req('POST'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      success: false,
      error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Your subscription has ended. Renew to make changes.' },
    })
  })

  it('refuses writes for a lapsed active date the cron has not flipped yet', async () => {
    m.gym = gym({ is_active: true, subscription_status: 'active', plan_type: 'monthly', subscription_ends_at: PAST })
    expect((await withAuth('T', ok)(req('PATCH'))).status).toBe(403)
  })

  it('refuses a GET on an expired gym too (reads leak tenant data)', async () => {
    m.gym = gym({ is_active: true, subscription_status: 'expired', plan_type: 'monthly', subscription_ends_at: PAST })
    expect((await withAuth('T', ok)(req('GET'))).status).toBe(403)
  })

  it('lets a POST through when the route opts in with allowWhenExpired', async () => {
    m.gym = gym({ is_active: true, subscription_status: 'expired', plan_type: 'monthly', subscription_ends_at: PAST })
    expect((await withAuth('T', ok, { allowWhenExpired: true })(req('POST'))).status).toBe(200)
  })

  it('blocks a deactivated gym even when its subscription is current', async () => {
    m.gym = gym({ is_active: false, subscription_status: 'active', plan_type: 'monthly', subscription_ends_at: FUTURE })
    expect((await withAuth('T', ok)(req('DELETE'))).status).toBe(403)
  })

  it('blocks suspended and cancelled gyms', async () => {
    for (const status of ['suspended', 'cancelled']) {
      m.gym = gym({ is_active: true, subscription_status: status, plan_type: 'monthly', subscription_ends_at: FUTURE })
      expect((await withAuth('T', ok)(req('POST'))).status).toBe(403)
    }
  })

  it('treats a Free gym (status active, NULL end) as writable', async () => {
    m.gym = gym({ is_active: true, subscription_status: 'active', plan_type: 'free', subscription_ends_at: null })
    expect((await withAuth('T', ok)(req('POST'))).status).toBe(200)
  })

  it('treats a running trial as writable', async () => {
    m.gym = gym({ is_active: true, subscription_status: 'trial', plan_type: 'trial', trial_ends_at: FUTURE })
    expect((await withAuth('T', ok)(req('POST'))).status).toBe(200)
  })
})

describe('subscriptionGuard helpers', () => {
  it('assertGymWritable returns null for a writable gym and a 403 for a lapsed one', async () => {
    expect(assertGymWritable({ is_active: true, subscription_status: 'active', subscription_ends_at: null })).toBeNull()
    const res = assertGymWritable({ is_active: true, subscription_status: 'expired' })
    expect(res?.status).toBe(403)
    expect((await res!.json()).error.code).toBe('SUBSCRIPTION_REQUIRED')
    expect(assertGymWritable(null)?.status).toBe(403)
  })

  it('assertGymWritableById fails closed when the read errors or returns no row', async () => {
    const client = (result: unknown) => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
    }) as never
    expect((await assertGymWritableById(client({ data: null, error: { message: 'x' } }), 'g1'))?.status).toBe(403)
    expect((await assertGymWritableById(client({ data: null, error: null }), 'g1'))?.status).toBe(403)
    expect(await assertGymWritableById(client({ data: { is_active: true, subscription_status: 'active', subscription_ends_at: null }, error: null }), 'g1')).toBeNull()
  })
})
