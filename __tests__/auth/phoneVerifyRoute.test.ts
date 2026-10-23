import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  verify: vi.fn(),
  upsertError: null as { code: string; message: string } | null,
  upsert: vi.fn(),
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
    from: () => ({ upsert: async (...a: unknown[]) => { m.upsert(...a); return { error: m.upsertError } } }),
  }),
}))
vi.mock('@/lib/auth/phone-otp', () => ({ verifyPhoneOtp: m.verify }))
vi.mock('@/lib/api/withAuth', () => ({
  apiError: (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ success: false, error: { code, message } }), { status }),
  apiSuccess: (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 }),
}))

import { POST } from '@/app/api/auth/phone/verify/route'

const call = (body: unknown, csrf = true) =>
  POST(new NextRequest('http://localhost/api/auth/phone/verify', {
    method: 'POST',
    headers: csrf ? { 'x-requested-with': 'XMLHttpRequest' } : {},
    body: JSON.stringify(body),
  }))

beforeEach(() => { m.user = { id: 'u1' }; m.upsertError = null; vi.clearAllMocks() })

describe('POST /api/auth/phone/verify', () => {
  it('403 without the CSRF header', async () => {
    expect((await call({ code: '123456' }, false)).status).toBe(403)
  })
  it('401 without a session', async () => {
    m.user = null
    expect((await call({ code: '123456' })).status).toBe(401)
  })
  it('400 for a malformed code', async () => {
    const res = await call({ code: '12ab' })
    expect(res.status).toBe(400)
    expect(m.verify).not.toHaveBeenCalled()
  })
  it('400 on mismatch and 429 on too many attempts', async () => {
    m.verify.mockResolvedValueOnce({ ok: false, reason: 'mismatch' })
    expect((await call({ code: '123456' })).status).toBe(400)
    m.verify.mockResolvedValueOnce({ ok: false, reason: 'too_many_attempts' })
    const res = await call({ code: '123456' })
    expect(res.status).toBe(429)
    expect((await res.json()).error.code).toBe('TOO_MANY_ATTEMPTS')
  })
  it('stores the server-held phone on success', async () => {
    m.verify.mockResolvedValueOnce({ ok: true, phone: '919876543210' })
    const res = await call({ code: '123456', phone: '910000000000' })
    expect(res.status).toBe(200)
    expect(m.upsert.mock.calls[0][0]).toMatchObject({ user_id: 'u1', phone_e164: '919876543210' })
  })
  it('409 when the number is taken (unique violation)', async () => {
    m.verify.mockResolvedValueOnce({ ok: true, phone: '919876543210' })
    m.upsertError = { code: '23505', message: 'dup' }
    const res = await call({ code: '123456' })
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('PHONE_IN_USE')
  })
})
