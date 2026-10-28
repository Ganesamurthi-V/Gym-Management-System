import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  after: vi.fn(),
}))

// after() needs a real request scope; run the callback immediately instead.
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => { m.after(fn); return fn() },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    rpc: (...a: unknown[]) => m.rpc(...a),
  }),
}))
vi.mock('@/lib/supabase/queries', () => ({ getGymForUser: async () => ({ id: 'g1', name: 'G' }) }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }), ROUTE_LIMITS: { DEFAULT: 60 } }))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: () => {} }))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {} }),
}))

import { withAuth } from '@/lib/api/withAuth'

const req = (method: string, path = '/api/members/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab') =>
  new NextRequest(`http://localhost${path}?q=1`, { method, headers: { 'x-requested-with': 'XMLHttpRequest' } })

beforeEach(() => {
  vi.clearAllMocks()
  m.rpc.mockResolvedValue({ error: null })
})

describe('withAuth action recording', () => {
  it('records a successful POST with the route name and normalised path', async () => {
    const res = await withAuth('MEMBERS_CREATE', async () => NextResponse.json({ ok: 1 }, { status: 201 }))(req('POST'))
    expect(res.status).toBe(201)
    expect(m.rpc).toHaveBeenCalledWith('record_owner_activity', {
      p_kind: 'action', p_path: '/api/members/:id', p_label: 'MEMBERS_CREATE', p_platform: null,
    })
  })
  it.each(['PUT', 'PATCH', 'DELETE'])('records %s', async (method) => {
    await withAuth('X', async () => NextResponse.json({}))(req(method))
    expect(m.rpc).toHaveBeenCalledTimes(1)
  })
  it('does not record GET', async () => {
    await withAuth('X', async () => NextResponse.json({}))(req('GET'))
    expect(m.after).not.toHaveBeenCalled()
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('does not record failed responses', async () => {
    await withAuth('X', async () => NextResponse.json({}, { status: 400 }))(req('POST'))
    await withAuth('X', async () => { throw new Error('boom') })(req('POST'))
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('does not record the activity route itself', async () => {
    await withAuth('X', async () => NextResponse.json({}))(req('POST', '/api/owner/activity'))
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('never changes the response when the rpc fails', async () => {
    m.rpc.mockRejectedValue(new Error('down'))
    const res = await withAuth('X', async () => NextResponse.json({ a: 1 }))(req('POST'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ a: 1 })
  })
})
