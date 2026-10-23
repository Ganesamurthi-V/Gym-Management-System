import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  generateLink: vi.fn(),
  lead: vi.fn(),
  emailOk: true,
}))

vi.mock('@upstash/redis', () => ({ Redis: class { async set() { return 'OK' } } }))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class { static slidingWindow() { return {} } async limit() { return { success: true, reset: 0 } } },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        generateLink: (...a: unknown[]) => m.generateLink(...a),
        updateUserById: async () => ({ error: null }),
        deleteUser: async () => ({ error: null }),
      },
    },
  }),
}))
vi.mock('@/lib/email/resend', () => ({
  sendSetPasswordEmail: async () => (m.emailOk ? { ok: true } : { ok: false, message: 'down' }),
}))
vi.mock('@/lib/auth/phone-leads', () => ({ recordPhoneLead: (...a: unknown[]) => m.lead(...a) }))

import { POST } from '@/app/api/auth/signup/route'

const call = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }))

const base = { email: 'Asha@Example.com', fullName: 'Asha K' }

beforeEach(() => {
  vi.clearAllMocks()
  m.emailOk = true
  m.lead.mockResolvedValue(undefined)
  m.generateLink.mockResolvedValue({
    data: { user: { id: 'u1', app_metadata: {} }, properties: { hashed_token: 'tok' } },
    error: null,
  })
})

describe('POST /api/auth/signup mobile number', () => {
  it.each([undefined, '', '123', 'abcdefghij', 5551234567])('400 and no account for mobileNumber %j', async mobileNumber => {
    const res = await call({ ...base, mobileNumber })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Enter a valid 10-digit mobile number.')
    expect(m.generateLink).not.toHaveBeenCalled()
    expect(m.lead).not.toHaveBeenCalled()
  })
  it('stores E.164 in metadata and records the lead with consent', async () => {
    const res = await call({ ...base, mobileNumber: '98765 43210', marketingConsent: true })
    expect(res.status).toBe(200)
    expect(m.generateLink.mock.calls[0][0].options.data.mobile_number).toBe('919876543210')
    expect(m.lead).toHaveBeenCalledWith({
      phoneE164: '919876543210', email: 'asha@example.com', fullName: 'Asha K', userId: 'u1', consent: true,
    })
  })
  it('consent defaults to null when absent or not a boolean', async () => {
    await call({ ...base, mobileNumber: '9876543210' })
    await call({ ...base, mobileNumber: '9876543210', marketingConsent: 'yes' })
    expect(m.lead.mock.calls.map(c => (c[0] as { consent: unknown }).consent)).toEqual([null, null])
  })
  it('does not record a lead when the confirmation email fails and the account is rolled back', async () => {
    m.emailOk = false
    const res = await call({ ...base, mobileNumber: '9876543210' })
    expect(res.status).toBe(502)
    expect(m.lead).not.toHaveBeenCalled()
  })
})
