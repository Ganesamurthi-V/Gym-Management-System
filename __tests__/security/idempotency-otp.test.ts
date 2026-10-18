import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))

const { store, fakeRedis, state } = vi.hoisted(() => {
const store = new Map<string, string>()
const state = { available: true }
const fakeRedis = {
  set: vi.fn(async (k: string, v: string, o?: { nx?: boolean }) => {
    if (o?.nx && store.has(k)) return null
    store.set(k, v)
    return 'OK'
  }),
  get: vi.fn(async (k: string) => store.get(k) ?? null),
  del: vi.fn(async (k: string) => { store.delete(k); return 1 }),
  incr: vi.fn(async (k: string) => { const n = Number(store.get(k) ?? 0) + 1; store.set(k, String(n)); return n }),
  expire: vi.fn(async () => 1),
}
return { store, fakeRedis, state }
})
vi.mock('@/lib/redis', () => ({ getRedisClient: () => (state.available ? fakeRedis : null) }))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { return fakeRedis as never } } }))

import { claimIdempotencyKey } from '@/lib/api/idempotency'
import { issueDeleteOtp, verifyDeleteOtp } from '@/lib/account/delete-otp'

const reqWith = (key?: string) =>
  ({ headers: new Headers(key ? { 'idempotency-key': key } : {}) }) as never
const K = '3f2b8c1e-6a4d-4e2f-9b1a-0c5d7e8f9a10'

beforeEach(() => { store.clear(); state.available = true })

describe('claimIdempotencyKey', () => {
  it('passes first call, rejects duplicate with 409', async () => {
    expect(await claimIdempotencyKey(reqWith(K), 'g1', 'payments')).toBeNull()
    const dup = await claimIdempotencyKey(reqWith(K), 'g1', 'payments')
    expect(dup?.status).toBe(409)
    expect((await dup!.json()).error.code).toBe('DUPLICATE_REQUEST')
  })
  it('scopes by gym and route', async () => {
    await claimIdempotencyKey(reqWith(K), 'g1', 'payments')
    expect(await claimIdempotencyKey(reqWith(K), 'g2', 'payments')).toBeNull()
    expect(await claimIdempotencyKey(reqWith(K), 'g1', 'dues-collect')).toBeNull()
  })
  it('passes with no header and rejects a non-UUID key', async () => {
    expect(await claimIdempotencyKey(reqWith(), 'g1', 'payments')).toBeNull()
    expect((await claimIdempotencyKey(reqWith('abc'), 'g1', 'payments'))?.status).toBe(400)
  })
  it('skips when Redis is not configured', async () => {
    state.available = false
    expect(await claimIdempotencyKey(reqWith(K), 'g1', 'payments')).toBeNull()
    expect(await claimIdempotencyKey(reqWith(K), 'g1', 'payments')).toBeNull()
  })
})

describe('delete OTP purpose binding', () => {
  it('rejects a delete-gym code for delete-data and vice versa', async () => {
    const gymCode = await issueDeleteOtp('u1', 'delete-gym')
    expect((await verifyDeleteOtp('u1', gymCode, 'delete-data')).ok).toBe(false)
    expect((await verifyDeleteOtp('u1', gymCode, 'delete-gym')).ok).toBe(true)

    const dataCode = await issueDeleteOtp('u1', 'delete-data')
    expect((await verifyDeleteOtp('u1', dataCode, 'delete-gym')).ok).toBe(false)
    expect((await verifyDeleteOtp('u1', dataCode, 'delete-data')).ok).toBe(true)
  })
  it('defaults to delete-gym and is single-use', async () => {
    const code = await issueDeleteOtp('u2')
    expect((await verifyDeleteOtp('u2', code)).ok).toBe(true)
    expect((await verifyDeleteOtp('u2', code)).ok).toBe(false)
  })
})

describe('routes call the helpers', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it.each([
    'app/api/payments/route.ts',
    'app/api/members/route.ts',
    'app/api/dues/collect/route.ts',
    'app/api/dues/mark-paid/route.ts',
    'app/api/memberships/route.ts',
    'app/api/inventory/sell/route.ts',
  ])('%s claims an idempotency key', p => {
    expect(src(p)).toContain('claimIdempotencyKey(')
  })
  it('delete-data verifies a delete-data OTP', () => {
    expect(src('app/api/account/delete-data/route.ts')).toContain("verifyDeleteOtp(user.id, otpToken, 'delete-data')")
    expect(src('app/api/account/delete-data/request-otp/route.ts')).toContain("issueDeleteOtp(user.id, 'delete-data')")
  })
})
