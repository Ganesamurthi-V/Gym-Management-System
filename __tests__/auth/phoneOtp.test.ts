import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const { store, fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>()
  const fakeRedis = {
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); return 'OK' }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => { store.delete(k); return 1 }),
    incr: vi.fn(async (k: string) => { const n = Number(store.get(k) ?? 0) + 1; store.set(k, String(n)); return n }),
    expire: vi.fn(async () => 1),
  }
  return { store, fakeRedis }
})
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { return fakeRedis as never } } }))

import { issuePhoneOtp, verifyPhoneOtp } from '@/lib/auth/phone-otp'
import { normalizeIndianMobile, maskIndianMobile } from '@/lib/auth/phone'

const U = 'user-1'
const P = '919876543210'
const wrong = (code: string) => (code === '000000' ? '111111' : '000000')

beforeEach(() => { store.clear(); vi.clearAllMocks() })

describe('phone OTP', () => {
  it('issues a 6-digit code and stores only its hash', async () => {
    const code = await issuePhoneOtp(U, P)
    expect(code).toMatch(/^\d{6}$/)
    expect(store.get(`phone-otp:code:${U}`)).not.toContain(code)
    expect(store.get(`phone-otp:phone:${U}`)).toBe(P)
  })

  it('verifies the right code, returns the issued phone, and is single use', async () => {
    const code = await issuePhoneOtp(U, P)
    expect(await verifyPhoneOtp(U, code)).toEqual({ ok: true, phone: P })
    expect(await verifyPhoneOtp(U, code)).toEqual({ ok: false, reason: 'expired' })
  })

  it('reports expired when nothing is stored', async () => {
    expect(await verifyPhoneOtp(U, '123456')).toEqual({ ok: false, reason: 'expired' })
  })

  it('counts wrong guesses and burns the code at 5', async () => {
    const code = await issuePhoneOtp(U, P)
    for (let i = 0; i < 4; i++) {
      expect(await verifyPhoneOtp(U, wrong(code))).toEqual({ ok: false, reason: 'mismatch' })
    }
    expect(await verifyPhoneOtp(U, wrong(code))).toEqual({ ok: false, reason: 'too_many_attempts' })
    expect(await verifyPhoneOtp(U, code)).toEqual({ ok: false, reason: 'expired' })
  })

  it('re-issue overwrites the code and phone and resets attempts', async () => {
    const first = await issuePhoneOtp(U, P)
    await verifyPhoneOtp(U, wrong(first))
    await verifyPhoneOtp(U, wrong(first))
    const second = await issuePhoneOtp(U, '919123456789')
    expect(store.has(`phone-otp:attempts:${U}`)).toBe(false)
    if (second !== first) expect((await verifyPhoneOtp(U, first)).ok).toBe(false)
    const again = await issuePhoneOtp(U, '919123456789')
    expect(await verifyPhoneOtp(U, again)).toEqual({ ok: true, phone: '919123456789' })
  })
})

describe('normalizeIndianMobile', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['+91 98765 43210', '919876543210'],
    ['91-9876543210', '919876543210'],
    ['09876543210', '919876543210'],
    ['  6000000000 ', '916000000000'],
  ])('accepts %s', (input, out) => expect(normalizeIndianMobile(input)).toBe(out))

  it.each(['', '12345', '5876543210', '98765432101', '+44 9876543210', '98765abc10', '++919876543210x'])(
    'rejects %j', input => expect(normalizeIndianMobile(input)).toBeNull(),
  )

  it('masks all but the first and last two digits', () => {
    expect(maskIndianMobile('919876543210')).toBe('+91 98XXXXXX10')
  })
})
