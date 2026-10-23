import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  user: { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Asha K' } } as Record<string, unknown> | null,
  rpc: vi.fn(),
  rpcResult: { error: null } as { error: { message: string } | null },
  rpcThrows: false,
  lead: vi.fn(),
  marked: vi.fn(),
  verify: vi.fn(),
}))

vi.mock('@upstash/redis', () => ({
  Redis: class { async set() { return 'OK' } async ttl() { return 0 } async del() { return 1 } },
}))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class { static slidingWindow() { return {} } async limit() { return { success: true, reset: 0 } } },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user }, error: null }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (...a: unknown[]) => { m.rpc(...a); if (m.rpcThrows) throw new Error('boom'); return m.rpcResult },
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q; q.eq = () => q; q.neq = () => q
      q.maybeSingle = async () => ({ data: null, error: null })
      q.upsert = async () => ({ error: null })
      return q
    },
  }),
}))
vi.mock('@/lib/auth/phone-otp', () => ({
  issuePhoneOtp: async () => '123456', clearPhoneOtp: async () => {}, verifyPhoneOtp: m.verify,
}))
vi.mock('@/services/whatsapp/graph', () => ({ sendAuthOtp: async () => ({ success: true }) }))
vi.mock('@/lib/api/withAuth', () => ({
  apiError: (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ success: false, error: { code, message } }), { status }),
  apiSuccess: (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 }),
}))
vi.mock('@/lib/auth/phone-leads', () => ({
  recordPhoneLead: (...a: unknown[]) => m.lead(...a),
  markPhoneLeadVerified: (...a: unknown[]) => m.marked(...a),
}))

import { POST as requestOtp } from '@/app/api/auth/phone/request-otp/route'
import { POST as verifyRoute } from '@/app/api/auth/phone/verify/route'

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost/api/auth/phone/${url}`, {
    method: 'POST', headers: { 'x-requested-with': 'XMLHttpRequest' }, body: JSON.stringify(body),
  })

const real = () => vi.importActual<typeof import('@/lib/auth/phone-leads')>('@/lib/auth/phone-leads')

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Asha K' } }
  m.rpcResult = { error: null }; m.rpcThrows = false
  m.lead.mockResolvedValue(undefined)
})

describe('phone-leads module (real implementation)', () => {
  it('calls the RPCs with the right args', async () => {
    const r = await real()
    await r.recordPhoneLead({ phoneE164: '919876543210', email: 'a@b.com', fullName: 'Asha', userId: 'u1', consent: true })
    expect(m.rpc).toHaveBeenCalledWith('record_owner_phone_lead', {
      p_phone: '919876543210', p_email: 'a@b.com', p_full_name: 'Asha', p_user_id: 'u1', p_consent: true,
    })
    await r.markPhoneLeadVerified('919876543210', 'u1')
    expect(m.rpc).toHaveBeenCalledWith('mark_owner_phone_lead_verified', { p_phone: '919876543210', p_user_id: 'u1' })
  })
  it('swallows RPC errors and thrown errors', async () => {
    const r = await real()
    const args = { phoneE164: '919876543210', email: null, fullName: null, userId: 'u1', consent: null }
    m.rpcResult = { error: { message: 'nope' } }
    await expect(r.recordPhoneLead(args)).resolves.toBeUndefined()
    await expect(r.markPhoneLeadVerified('919876543210', 'u1')).resolves.toBeUndefined()
    m.rpcThrows = true
    await expect(r.recordPhoneLead(args)).resolves.toBeUndefined()
    await expect(r.markPhoneLeadVerified('919876543210', 'u1')).resolves.toBeUndefined()
  })
})

describe('POST /api/auth/phone/request-otp lead capture', () => {
  it('writes a lead for a valid authenticated request', async () => {
    const res = await requestOtp(post('request-otp', { mobileNumber: '9876543210', marketingConsent: true }))
    expect(res.status).toBe(200)
    expect(m.lead).toHaveBeenCalledWith(expect.objectContaining({
      phoneE164: '919876543210', email: 'a@b.com', fullName: 'Asha K', userId: 'u1', consent: true,
    }))
  })
  it('does not write when unauthenticated or the phone is invalid', async () => {
    m.user = null
    expect((await requestOtp(post('request-otp', { mobileNumber: '9876543210' }))).status).toBe(401)
    m.user = { id: 'u1' }
    expect((await requestOtp(post('request-otp', { mobileNumber: '123' }))).status).toBe(400)
    expect(m.lead).not.toHaveBeenCalled()
  })
  it('passes consent true / false / absent or non-boolean as true / false / null', async () => {
    await requestOtp(post('request-otp', { mobileNumber: '9876543210', marketingConsent: true }))
    await requestOtp(post('request-otp', { mobileNumber: '9876543210', marketingConsent: false }))
    await requestOtp(post('request-otp', { mobileNumber: '9876543210' }))
    await requestOtp(post('request-otp', { mobileNumber: '9876543210', marketingConsent: 'yes' }))
    expect(m.lead.mock.calls.map(c => (c[0] as { consent: unknown }).consent)).toEqual([true, false, null, null])
  })
  it('returns the same response when the real lead write fails at the RPC', async () => {
    const r = await real()
    m.lead.mockImplementation(r.recordPhoneLead)
    m.rpcThrows = true
    const res = await requestOtp(post('request-otp', { mobileNumber: '9876543210' }))
    expect(res.status).toBe(200)
    expect((await res.json()).data.maskedPhone).toBeTruthy()
  })
})

describe('POST /api/auth/phone/verify lead capture', () => {
  it('marks the lead verified', async () => {
    m.verify.mockResolvedValueOnce({ ok: true, phone: '919876543210' })
    const res = await verifyRoute(post('verify', { code: '123456' }))
    expect(res.status).toBe(200)
    expect(m.marked).toHaveBeenCalledWith('919876543210', 'u1')
  })
})
