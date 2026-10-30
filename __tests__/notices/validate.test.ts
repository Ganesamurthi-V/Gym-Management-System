import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createNoticeSchema, updateNoticeSchema, mapNoticeRow } from '@/lib/notices/validate'

const base = { kind: 'info', title: 'Holiday hours', body: 'Closed on Sunday.' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z')) // 11:30 IST, 28 Oct 2026
})
afterEach(() => vi.useRealTimers())

describe('createNoticeSchema', () => {
  it('accepts a valid notice and leaves expires_on undefined', () => {
    const r = createNoticeSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.expires_on).toBeUndefined()
  })

  it('trims title and enforces 3-80', () => {
    expect(createNoticeSchema.safeParse({ ...base, title: '  Hey  ' }).success).toBe(true)
    expect(createNoticeSchema.safeParse({ ...base, title: ' ab ' }).success).toBe(false)
    expect(createNoticeSchema.safeParse({ ...base, title: 'a'.repeat(80) }).success).toBe(true)
    expect(createNoticeSchema.safeParse({ ...base, title: 'a'.repeat(81) }).success).toBe(false)
  })

  it('enforces body 3-500', () => {
    expect(createNoticeSchema.safeParse({ ...base, body: 'ab' }).success).toBe(false)
    expect(createNoticeSchema.safeParse({ ...base, body: 'a'.repeat(500) }).success).toBe(true)
    expect(createNoticeSchema.safeParse({ ...base, body: 'a'.repeat(501) }).success).toBe(false)
  })

  it('collapses blank lines and strips trailing spaces', () => {
    const r = createNoticeSchema.parse({ ...base, body: 'Line one   \n\n\n\n\nLine two  \n' })
    expect(r.body).toBe('Line one\n\nLine two')
  })

  it('rejects an unknown kind', () => {
    expect(createNoticeSchema.safeParse({ ...base, kind: 'spam' }).success).toBe(false)
  })

  it('expiry window: today and today+365 pass, yesterday and +366 fail', () => {
    const ok = (d: string) => createNoticeSchema.safeParse({ ...base, expires_on: d }).success
    expect(ok('2026-10-28')).toBe(true)
    expect(ok('2027-10-28')).toBe(true)
    expect(ok('2026-10-27')).toBe(false)
    expect(ok('2027-10-29')).toBe(false)
    expect(ok('2026-02-30')).toBe(false)
    expect(ok('tomorrow')).toBe(false)
    expect(createNoticeSchema.safeParse({ ...base, expires_on: null }).success).toBe(true)
  })

  it('strips unknown keys, including gym_id', () => {
    const r = createNoticeSchema.parse({ ...base, gym_id: 'x', is_active: false })
    expect(r).not.toHaveProperty('gym_id')
    expect(r).not.toHaveProperty('is_active')
  })
})

describe('updateNoticeSchema', () => {
  it('accepts partial updates and is_active', () => {
    expect(updateNoticeSchema.parse({ is_active: false })).toEqual({ is_active: false })
    expect(updateNoticeSchema.parse({})).toEqual({})
  })
  it('validates and trims provided fields', () => {
    expect(updateNoticeSchema.parse({ title: '  New title ' }).title).toBe('New title')
    expect(updateNoticeSchema.safeParse({ title: 'x' }).success).toBe(false)
    expect(updateNoticeSchema.safeParse({ is_active: 'yes' }).success).toBe(false)
  })
  it('strips unknown keys', () => {
    expect(updateNoticeSchema.parse({ gym_id: 'x', is_active: true })).toEqual({ is_active: true })
  })
})

describe('mapNoticeRow', () => {
  it('maps snake_case to GymNotice', () => {
    expect(
      mapNoticeRow({ id: 'a', kind: 'holiday', title: 'T', body: 'B', expires_on: '2026-11-01', is_active: true, created_at: 'now' }),
    ).toEqual({ id: 'a', kind: 'holiday', title: 'T', body: 'B', expiresOn: '2026-11-01', isActive: true, createdAt: 'now' })
  })
  it('falls back to info for an unknown kind and null expiry', () => {
    const n = mapNoticeRow({ id: 'a', kind: 'zzz', title: 'T', body: 'B', expires_on: null, is_active: false, created_at: 'n' })
    expect(n.kind).toBe('info')
    expect(n.expiresOn).toBeNull()
  })
})
