import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayIST } from '@/lib/utils'

// Servers run in UTC; between 00:00 and 05:30 IST the UTC calendar day is still "yesterday".
describe('todayIST', () => {
  afterEach(() => vi.useRealTimers())

  it('returns the next calendar day when UTC is still the previous day in IST', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T20:00:00Z'))
    expect(todayIST()).toBe('2026-10-20')
  })

  it('returns the same day when UTC and IST agree', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T10:00:00Z'))
    expect(todayIST()).toBe('2026-10-19')
  })
})
