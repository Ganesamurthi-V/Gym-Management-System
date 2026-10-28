import { describe, expect, it } from 'vitest'
import { isNewVisit, normalizeActivityPath, normalizeRequestPath, shouldLogPageView } from '@/lib/activity/normalize'

describe('normalizeActivityPath', () => {
  it('keeps the pathname only and replaces ids', () => {
    expect(normalizeActivityPath('/owner/members/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab?tab=pay#x')).toBe('/owner/members/:id')
    expect(normalizeActivityPath('/owner/reports/20261029')).toBe('/owner/reports/:id')
    expect(normalizeActivityPath('/owner/plans/123')).toBe('/owner/plans/123')
  })
  it('collapses slashes and caps at 200', () => {
    expect(normalizeActivityPath('/owner//members///list')).toBe('/owner/members/list')
    expect(normalizeActivityPath('/owner/' + 'a'.repeat(500))!.length).toBe(200)
  })
  it('rejects non-owner paths and bad input', () => {
    expect(normalizeActivityPath('/m/home')).toBeNull()
    expect(normalizeActivityPath('/owner')).toBeNull()
    expect(normalizeActivityPath('https://evil.test/owner/x')).toBeNull()
    expect(normalizeActivityPath(undefined)).toBeNull()
  })
  it('normalizeRequestPath handles api paths', () => {
    expect(normalizeRequestPath('/api/members/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab')).toBe('/api/members/:id')
  })
})

describe('shouldLogPageView', () => {
  it('ignores the same path within 10 s only', () => {
    expect(shouldLogPageView(null, '/owner/a', 1000)).toBe(true)
    expect(shouldLogPageView({ path: '/owner/a', at: 1000 }, '/owner/a', 9999)).toBe(false)
    expect(shouldLogPageView({ path: '/owner/a', at: 1000 }, '/owner/a', 11000)).toBe(true)
    expect(shouldLogPageView({ path: '/owner/a', at: 1000 }, '/owner/b', 1500)).toBe(true)
  })
})

describe('isNewVisit', () => {
  const now = 10_000_000
  it('is true when never seen or after more than 30 minutes', () => {
    expect(isNewVisit(null, now)).toBe(true)
    expect(isNewVisit(now - 30 * 60 * 1000 - 1, now)).toBe(true)
  })
  it('is false within 30 minutes', () => {
    expect(isNewVisit(now - 30 * 60 * 1000, now)).toBe(false)
    expect(isNewVisit(now - 1000, now)).toBe(false)
  })
})
