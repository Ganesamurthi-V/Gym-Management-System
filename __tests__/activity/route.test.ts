import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  allowed: true,
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user } }) },
    rpc: (...a: unknown[]) => m.rpc(...a),
  }),
}))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: m.allowed }), ROUTE_LIMITS: { DEFAULT: 60 } }))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {} }),
}))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: () => {} }))
vi.mock('@/lib/supabase/queries', () => ({ getGymForUser: async () => null }))

import { POST } from '@/app/api/owner/activity/route'

const post = (body: unknown, headers: Record<string, string> = { 'x-requested-with': 'XMLHttpRequest' }) =>
  POST(new NextRequest('http://localhost/api/owner/activity', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  }))

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'u1' }; m.allowed = true
  m.rpc.mockResolvedValue({ error: null })
})

describe('POST /api/owner/activity', () => {
  it('requires a signed-in user', async () => {
    m.user = null
    expect((await post({ kind: 'page_view', path: '/owner/dashboard' })).status).toBe(401)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('rejects a cross-site request', async () => {
    const res = await post({ kind: 'page_view', path: '/owner/dashboard' }, { origin: 'https://evil.test' })
    expect(res.status).toBe(403)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('never accepts the action kind from the browser', async () => {
    expect((await post({ kind: 'action', path: '/owner/dashboard' })).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('rejects a non-owner path', async () => {
    expect((await post({ kind: 'page_view', path: '/m/home' })).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('records a normalised page view and answers 204 no-store', async () => {
    const res = await post({ kind: 'page_view', path: '/owner/members/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab?x=1', platform: 'mobile' })
    expect(res.status).toBe(204)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(m.rpc).toHaveBeenCalledWith('record_owner_activity', {
      p_kind: 'page_view', p_path: '/owner/members/:id', p_label: null, p_platform: 'mobile',
    })
  })
  it('stays ok when the rpc fails', async () => {
    m.rpc.mockResolvedValue({ error: { message: 'boom' } })
    expect((await post({ kind: 'app_open', path: '/owner/dashboard' })).status).toBe(204)
  })
  it('rate limits', async () => {
    m.allowed = false
    expect((await post({ kind: 'app_open', path: '/owner/dashboard' })).status).toBe(429)
  })
})
