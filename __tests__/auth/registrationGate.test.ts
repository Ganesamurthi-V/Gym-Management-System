import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  existingGym: null as { id: string } | null,
  insert: vi.fn(),
}))

const chain = (result: () => unknown) => {
  const q: Record<string, unknown> = {}
  q.select = () => q; q.eq = () => q
  q.maybeSingle = async () => result()
  q.single = async () => result()
  return q
}
const gymsTable = () => ({
  ...chain(() => ({ data: m.existingGym, error: null })),
  update: () => chain(() => ({ data: m.existingGym, error: null })),
  insert: (...a: unknown[]) => { m.insert(...a); return chain(() => ({ data: { id: 'g-new' }, error: null })) },
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user }, error: null }) },
    from: () => gymsTable(),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'members' ? chain(() => ({ data: null, error: null })) : gymsTable()),
    auth: { admin: { updateUserById: async () => ({ error: null }) } },
  }),
}))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }), ROUTE_LIMITS: { DEFAULT: {} } }))
vi.mock('@/lib/logger', () => {
  const l: Record<string, unknown> = { error() {}, warn() {}, info() {}, debug() {} }
  l.child = () => l
  return { logger: l }
})

import { POST as finalize } from '@/app/api/auth/finalize-registration/route'
import { POST as onboarding } from '@/app/api/onboarding/complete/route'

const owner = (mobile?: string) => ({
  id: 'u1',
  email: 'a@b.com',
  email_confirmed_at: '2026-01-01',
  app_metadata: { gymflow_registration: 'owner' },
  user_metadata: { full_name: 'Asha K', ...(mobile ? { mobile_number: mobile } : {}) },
})

const post = (url: string, body: unknown = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST', headers: { 'x-requested-with': 'XMLHttpRequest' }, body: JSON.stringify(body),
  })

beforeEach(() => { vi.clearAllMocks(); m.existingGym = null; m.user = owner() })

describe('POST /api/auth/finalize-registration mobile gate', () => {
  it('403 PHONE_REQUIRED when no number is saved', async () => {
    const res = await finalize(post('/api/auth/finalize-registration'))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('PHONE_REQUIRED')
    expect(m.insert).not.toHaveBeenCalled()
  })
  it('creates the gym when a number is saved', async () => {
    m.user = owner('919876543210')
    const res = await finalize(post('/api/auth/finalize-registration'))
    expect(res.status).toBe(200)
    expect(m.insert).toHaveBeenCalled()
  })
  it('an existing gym returns 409 before the phone check', async () => {
    m.existingGym = { id: 'g1' }
    const res = await finalize(post('/api/auth/finalize-registration'))
    expect(res.status).toBe(409)
  })
})

describe('POST /api/onboarding/complete mobile gate', () => {
  const body = { gymName: 'Iron Works', gymType: 'Gym' }
  it('403 PHONE_REQUIRED when it would create a gym without a saved number', async () => {
    const res = await onboarding(post('/api/onboarding/complete', body))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('PHONE_REQUIRED')
    expect(m.insert).not.toHaveBeenCalled()
  })
  it('creates the gym when a number is saved', async () => {
    m.user = owner('919876543210')
    const res = await onboarding(post('/api/onboarding/complete', body))
    expect(res.status).toBe(200)
    expect(m.insert).toHaveBeenCalled()
  })
  it('an existing gym is updated without needing the number', async () => {
    m.existingGym = { id: 'g1' }
    const res = await onboarding(post('/api/onboarding/complete', body))
    expect(res.status).toBe(200)
  })
})
