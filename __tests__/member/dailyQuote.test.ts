import { describe, expect, it } from 'vitest'
import { DAILY_QUOTES, quoteForDate } from '@/lib/member/daily-quote'

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('daily quote', () => {
  it('has exactly 100 quotes and none repeats', () => {
    expect(DAILY_QUOTES).toHaveLength(100)
    expect(new Set(DAILY_QUOTES).size).toBe(100)
    expect(DAILY_QUOTES.every(q => q.trim().length > 10 && !/\s{2,}/.test(q))).toBe(true)
  })

  it('is the same for a whole date and changes on the next date', () => {
    expect(quoteForDate('2026-10-27')).toBe(quoteForDate('2026-10-27'))
    expect(quoteForDate('2026-10-27')).not.toBe(quoteForDate('2026-10-28'))
  })

  it('shows 100 different quotes on 100 consecutive days, then starts again', () => {
    const start = '2026-01-01'
    const seen = new Set(Array.from({ length: 100 }, (_, i) => quoteForDate(addDays(start, i))))
    expect(seen.size).toBe(100)
    expect(quoteForDate(addDays(start, 100))).toBe(quoteForDate(start))
  })

  it('handles month and year boundaries (it is a calendar date, not a time)', () => {
    expect(quoteForDate('2026-12-31')).not.toBe(quoteForDate('2027-01-01'))
    expect(quoteForDate('2028-02-28')).not.toBe(quoteForDate('2028-02-29'))
  })
})
