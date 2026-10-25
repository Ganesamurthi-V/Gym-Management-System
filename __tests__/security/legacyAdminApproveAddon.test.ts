import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Regression: the older admin page (/owner/admin/subscriptions) approves through this route and
// sends plan_type 'monthly' by default. It ignored subscription_requests.plan_requested, so a Rs 299
// WhatsApp add-on payment was approved as a full Monthly plan (Member App, no member cap).

const m = vi.hoisted(() => ({
  request: { gym_id: 'g1', status: 'pending', plan_requested: 'whatsapp_addon' } as Record<string, unknown>,
  gymUpdates: [] as unknown[],
  rpc: vi.fn(async () => ({ data: '2026-12-01T00:00:00Z', error: null as unknown })),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/adminAuth', () => ({ requireAdmin: async () => ({ ok: true }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: m.rpc,
    from: (table: string) => {
      const q: any = {}
      q.select = () => q
      q.eq = () => q
      q.single = async () => ({ data: m.request, error: null })
      q.update = (patch: unknown) => { if (table === 'gyms') m.gymUpdates.push(patch); return q }
      q.then = (res: (v: unknown) => void) => res({ error: null })
      return q
    },
  }),
}))

import { POST } from '@/app/api/admin/subscription-requests/[id]/route'

const call = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/admin/subscription-requests/r1', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'r1' }) })

beforeEach(() => {
  m.gymUpdates = []
  m.rpc.mockClear()
  m.request = { gym_id: 'g1', status: 'pending', plan_requested: 'whatsapp_addon' }
})

describe('POST /api/admin/subscription-requests/[id]', () => {
  it('approves an add-on request as the add-on even when the page sends monthly', async () => {
    const res = await call({ action: 'approve', plan_type: 'monthly' })
    expect(res.status).toBe(200)
    expect(m.rpc).toHaveBeenCalledWith('approve_whatsapp_addon', { p_request_id: 'r1', p_gym_id: 'g1', p_reviewed_by: 'admin' })
    expect(m.gymUpdates).toEqual([]) // never writes plan_type / subscription_status
  })

  it('rejects a plan that is not a paid plan', async () => {
    m.request = { gym_id: 'g1', status: 'pending', plan_requested: 'monthly' }
    const res = await call({ action: 'approve', plan_type: 'free' })
    expect(res.status).toBe(400)
    expect(m.gymUpdates).toEqual([])
  })

  it('still approves a monthly plan request as before', async () => {
    m.request = { gym_id: 'g1', status: 'pending', plan_requested: 'monthly' }
    const res = await call({ action: 'approve', plan_type: 'monthly' })
    expect(res.status).toBe(200)
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.gymUpdates[0]).toMatchObject({ plan_type: 'monthly', subscription_status: 'active' })
  })
})
