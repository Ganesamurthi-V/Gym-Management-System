import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Member App management must respect the plan: no invitations on a Free gym, and on a trial only
// for the first PLAN_MEMBER_LIMIT members by join date. Plan data comes from the gym row, never
// from the request.

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  gym: null as Record<string, unknown> | null,
  eligible: [] as string[],
  prepare: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.order = () => chain
      chain.limit = async () => ({ data: m.eligible.map(id => ({ id })), error: null })
      return chain
    },
  }),
}))
vi.mock('@/lib/supabase/queries', () => ({ getGymForUser: async () => m.gym }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }), ROUTE_LIMITS: { DEFAULT: 60 } }))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: () => {} }))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {}, requestId: 'r' }),
}))
vi.mock('@/lib/member-invitation-server', () => ({ prepareMemberInvitation: (...a: unknown[]) => m.prepare(...a) }))
vi.mock('@/lib/whatsapp/sender', () => ({ sendWhatsAppTemplate: async () => ({ success: true }) }))

import { POST } from '@/app/api/member-app/invite/route'

const MEMBER = '11111111-1111-4111-8111-111111111111'
const invite = () =>
  POST(new NextRequest('http://localhost/api/member-app/invite', {
    method: 'POST',
    headers: { 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: MEMBER }),
  }))

const FUTURE = '2999-01-01T00:00:00.000Z'
const MESSAGE = 'The Member App is not included in your plan. Upgrade to a paid plan.'

beforeEach(() => {
  m.prepare.mockReset()
  m.prepare.mockResolvedValue({ ok: false, code: 'NOT_FOUND', message: 'stop here' })
  process.env.SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
})

describe('POST /api/member-app/invite plan gate', () => {
  it('refuses a Free gym before any login is created', async () => {
    m.gym = { id: 'g1', name: 'G', is_active: true, subscription_status: 'active', plan_type: 'free', subscription_ends_at: null }
    const res = await invite()
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe(MESSAGE)
    expect(m.prepare).not.toHaveBeenCalled()
  })

  it('refuses a trial member outside the first PLAN_MEMBER_LIMIT', async () => {
    m.gym = { id: 'g1', name: 'G', is_active: true, subscription_status: 'trial', plan_type: 'trial', trial_ends_at: FUTURE }
    m.eligible = ['someone-else']
    const res = await invite()
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe(MESSAGE)
    expect(m.prepare).not.toHaveBeenCalled()
  })

  it('lets a covered trial member through to the invitation step', async () => {
    m.gym = { id: 'g1', name: 'G', is_active: true, subscription_status: 'trial', plan_type: 'trial', trial_ends_at: FUTURE }
    m.eligible = [MEMBER]
    await invite()
    expect(m.prepare).toHaveBeenCalledTimes(1)
  })

  it('refuses a paid gym whose subscription has lapsed', async () => {
    m.gym = { id: 'g1', name: 'G', is_active: true, subscription_status: 'expired', plan_type: 'monthly', subscription_ends_at: '2020-01-01T00:00:00.000Z' }
    const res = await invite()
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('SUBSCRIPTION_REQUIRED')
    expect(m.prepare).not.toHaveBeenCalled()
  })
})
