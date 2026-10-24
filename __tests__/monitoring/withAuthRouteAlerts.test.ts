import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  alert: vi.fn(),
  user: { id: 'user-1' } as { id: string } | null,
  gym: { id: 'gym-1', name: 'G' } as { id: string; name: string } | null,
  allowed: true,
}))

vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: (...a: unknown[]) => m.alert(...a) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user }, error: m.user ? null : new Error('x') }) } }),
}))
vi.mock('@/lib/supabase/queries', () => ({ getGymForUser: async () => m.gym }))
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: m.allowed }),
  ROUTE_LIMITS: { DEFAULT: 60 },
}))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {} }),
}))

import { withAuth } from '@/lib/api/withAuth'

const req = (headers: Record<string, string> = { 'x-requested-with': 'XMLHttpRequest' }) =>
  new NextRequest('http://localhost/api/x', { method: 'POST', headers })

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'user-1' }; m.gym = { id: 'gym-1', name: 'G' }; m.allowed = true
  m.alert.mockImplementation(() => {})
})

describe('withAuth 5xx alerts', () => {
  it('alerts when the handler throws and keeps the 500 body', async () => {
    const res = await withAuth('R_THROW', async () => { throw new Error('boom') })(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    expect(m.alert).toHaveBeenCalledTimes(1)
    const a = m.alert.mock.calls[0][0]
    expect(a).toMatchObject({ key: '5xx:R_THROW', severity: 'critical', gymId: 'gym-1' })
    expect(a.body).toContain('boom')
    expect(a.body).toContain('user-1')
  })

  it('alerts when the handler returns a 500 response without altering it', async () => {
    const res = await withAuth('R_500', async () =>
      NextResponse.json({ success: false, error: { code: 'DATABASE_ERROR', message: 'm' } }, { status: 500 }))(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: { code: 'DATABASE_ERROR', message: 'm' } })
    expect(m.alert).toHaveBeenCalledTimes(1)
    expect(m.alert.mock.calls[0][0]).toMatchObject({ key: '5xx:R_500', severity: 'critical' })
  })

  it('does not alert for 4xx responses', async () => {
    for (const status of [400, 401, 403, 404, 429]) {
      const res = await withAuth('R_4XX', async () => NextResponse.json({}, { status }))(req())
      expect(res.status).toBe(status)
    }
    // Guard-produced 401 / 403 / 404 / 429
    const ok = withAuth('R_4XX', async () => NextResponse.json({}))
    m.user = null
    expect((await ok(req())).status).toBe(401)
    m.user = { id: 'u' }
    expect((await ok(req({ origin: 'https://evil.example', referer: 'https://evil.example' }))).status).toBe(403)
    m.gym = null
    expect((await ok(req())).status).toBe(404)
    m.gym = { id: 'g', name: 'G' }; m.allowed = false
    expect((await ok(req())).status).toBe(429)
    expect(m.alert).not.toHaveBeenCalled()
  })

  it('still returns the 500 when the alert function throws synchronously', async () => {
    m.alert.mockImplementation(() => { throw new Error('alert down') })
    const res = await withAuth('R_ALERT_THROWS', async () => { throw new Error('boom') })(req())
    expect(res.status).toBe(500)
  })
})
