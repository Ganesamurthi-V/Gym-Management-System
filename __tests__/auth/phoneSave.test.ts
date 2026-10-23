import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ownerMobileFromUser } from '@/lib/auth/phone'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  member: null as { id: string } | null,
  updateError: null as { message: string } | null,
  update: vi.fn(),
  lead: vi.fn(),
}))

vi.mock('@upstash/redis', () => ({ Redis: class {} }))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class { static slidingWindow() { return {} } async limit() { return { success: true, reset: 0 } } },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user }, error: null }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q; q.eq = () => q
      q.maybeSingle = async () => ({ data: m.member, error: null })
      return q
    },
    auth: { admin: { updateUserById: async (...a: unknown[]) => { m.update(...a); return { error: m.updateError } } } },
  }),
}))
vi.mock('@/lib/api/withAuth', () => ({
  apiError: (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ success: false, error: { code, message } }), { status }),
  apiSuccess: (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 }),
}))
vi.mock('@/lib/auth/phone-leads', () => ({ recordPhoneLead: (...a: unknown[]) => m.lead(...a) }))

import { POST } from '@/app/api/auth/phone/save/route'

const call = (body: unknown, csrf = true) =>
  POST(new NextRequest('http://localhost/api/auth/phone/save', {
    method: 'POST',
    headers: csrf ? { 'x-requested-with': 'XMLHttpRequest' } : {},
    body: JSON.stringify(body),
  }))

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Asha K', keep: 'me' }, app_metadata: {} }
  m.member = null; m.updateError = null
  m.lead.mockResolvedValue(undefined)
})

describe('POST /api/auth/phone/save', () => {
  it('merges E.164 into existing metadata and records the lead', async () => {
    const res = await call({ mobileNumber: '98765 43210', marketingConsent: true })
    expect(res.status).toBe(200)
    expect((await res.json()).data.maskedPhone).toBe('+91 98XXXXXX10')
    expect(m.update).toHaveBeenCalledWith('u1', {
      user_metadata: { full_name: 'Asha K', keep: 'me', mobile_number: '919876543210' },
    })
    expect(m.lead).toHaveBeenCalledWith({
      phoneE164: '919876543210', email: 'a@b.com', fullName: 'Asha K', userId: 'u1', consent: true,
    })
  })
  it('passes consent true / false / absent or non-boolean as true / false / null', async () => {
    await call({ mobileNumber: '9876543210', marketingConsent: true })
    await call({ mobileNumber: '9876543210', marketingConsent: false })
    await call({ mobileNumber: '9876543210' })
    await call({ mobileNumber: '9876543210', marketingConsent: 'yes' })
    expect(m.lead.mock.calls.map(c => (c[0] as { consent: unknown }).consent)).toEqual([true, false, null, null])
  })
  it('400 INVALID_PHONE and nothing written for a bad number', async () => {
    const res = await call({ mobileNumber: '123' })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_PHONE')
    expect(m.update).not.toHaveBeenCalled()
    expect(m.lead).not.toHaveBeenCalled()
  })
  it('401 without a session', async () => {
    m.user = null
    expect((await call({ mobileNumber: '9876543210' })).status).toBe(401)
  })
  it('403 without the CSRF header', async () => {
    expect((await call({ mobileNumber: '9876543210' }, false)).status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('403 for a member identity (row or marker)', async () => {
    m.member = { id: 'mem1' }
    expect((await call({ mobileNumber: '9876543210' })).status).toBe(403)
    m.member = null
    m.user = { ...m.user, app_metadata: { gymflow_registration: 'member' }, user_metadata: { role: 'member' } }
    expect((await call({ mobileNumber: '9876543210' })).status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('500 and no lead when the metadata update fails', async () => {
    m.updateError = { message: 'nope' }
    expect((await call({ mobileNumber: '9876543210' })).status).toBe(500)
    expect(m.lead).not.toHaveBeenCalled()
  })
})

describe('ownerMobileFromUser', () => {
  it('normalises a stored number', () => {
    expect(ownerMobileFromUser({ user_metadata: { mobile_number: '9876543210' } })).toBe('919876543210')
    expect(ownerMobileFromUser({ user_metadata: { mobile_number: '+91 98765-43210' } })).toBe('919876543210')
  })
  it('returns null when absent, empty or invalid', () => {
    expect(ownerMobileFromUser({})).toBeNull()
    expect(ownerMobileFromUser({ user_metadata: null })).toBeNull()
    expect(ownerMobileFromUser({ user_metadata: {} })).toBeNull()
    expect(ownerMobileFromUser({ user_metadata: { mobile_number: '' } })).toBeNull()
    expect(ownerMobileFromUser({ user_metadata: { mobile_number: '12345' } })).toBeNull()
  })
})
