/**
 * IST day boundaries and rolling windows (lib/gamification/periods.ts).
 *
 * The bug these pin: the old SQL used the database's UTC CURRENT_DATE, so
 * between 00:00 and 05:30 IST "today" was still yesterday and week/month
 * counts were off by a day.
 */

import { describe, it, expect } from 'vitest'
import {
  addDays,
  countDaysInWindow,
  dayOfWeek,
  diffDays,
  gymToday,
  isInWindow,
  isValidDateString,
  istDateOf,
  istMinutesOfDay,
  istToday,
  monthWindow,
  rollingWindow,
  weekWindow,
} from '@/lib/gamification/periods'

/** An instant given as IST wall-clock time. */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`)

describe('IST calendar date', () => {
  it('23:50 IST is still the same day', () => {
    expect(istToday(ist('2026-10-12', '23:50'))).toBe('2026-10-12')
  })

  it('00:10 IST is the next day, although UTC is still on the previous date', () => {
    const now = ist('2026-10-13', '00:10')
    expect(now.toISOString().slice(0, 10)).toBe('2026-10-12') // the old UTC answer
    expect(istToday(now)).toBe('2026-10-13')
  })

  it('05:29 and 05:30 IST straddle UTC midnight but are the same IST day', () => {
    expect(istDateOf(ist('2026-10-13', '05:29'))).toBe('2026-10-13')
    expect(istDateOf(ist('2026-10-13', '05:30'))).toBe('2026-10-13')
  })

  it('accepts ISO strings and epoch milliseconds', () => {
    expect(istDateOf('2026-10-12T18:40:00Z')).toBe('2026-10-13')
    expect(istDateOf(Date.parse('2026-10-12T18:29:00Z'))).toBe('2026-10-12')
  })

  it('reports minutes since IST midnight', () => {
    expect(istMinutesOfDay(ist('2026-10-13', '00:00'))).toBe(0)
    expect(istMinutesOfDay(ist('2026-10-13', '04:59'))).toBe(299)
    expect(istMinutesOfDay(ist('2026-10-13', '23:59'))).toBe(1439)
  })
})

describe('gymToday (streak reference day)', () => {
  it('stays on the previous date until 05:00 IST', () => {
    expect(gymToday(ist('2026-10-13', '00:10'))).toBe('2026-10-12')
    expect(gymToday(ist('2026-10-13', '04:59'))).toBe('2026-10-12')
  })

  it('moves to the new date at 05:00 IST', () => {
    expect(gymToday(ist('2026-10-13', '05:00'))).toBe('2026-10-13')
    expect(gymToday(ist('2026-10-13', '05:01'))).toBe('2026-10-13')
  })

  it('equals the calendar date for the rest of the day', () => {
    expect(gymToday(ist('2026-10-12', '23:50'))).toBe('2026-10-12')
  })
})

describe('date arithmetic', () => {
  it('adds and subtracts across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // leap year
    expect(addDays('2026-10-12', 0)).toBe('2026-10-12')
  })

  it('throws on a malformed date instead of returning garbage', () => {
    expect(() => addDays('12/10/2026', 1)).toThrow()
  })

  it('diffDays is signed', () => {
    expect(diffDays('2026-10-10', '2026-10-12')).toBe(2)
    expect(diffDays('2026-10-12', '2026-10-10')).toBe(-2)
    expect(diffDays('2026-10-12', '2026-10-12')).toBe(0)
  })

  it('dayOfWeek matches Postgres EXTRACT(DOW): 0 = Sunday', () => {
    expect(dayOfWeek('2026-10-11')).toBe(0) // Sunday
    expect(dayOfWeek('2026-10-12')).toBe(1) // Monday
    expect(dayOfWeek('2026-10-17')).toBe(6) // Saturday
  })

  it('isValidDateString rejects impossible and malformed dates', () => {
    expect(isValidDateString('2026-10-12')).toBe(true)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('2026-1-1')).toBe(false)
    expect(isValidDateString('')).toBe(false)
    expect(isValidDateString(null)).toBe(false)
    expect(isValidDateString(20261012)).toBe(false)
  })
})

describe('rolling windows', () => {
  const noon = ist('2026-10-12', '12:00')

  it('last 7 days is today and the 6 days before it, inclusive', () => {
    expect(weekWindow(noon)).toEqual({ start: '2026-10-06', end: '2026-10-12' })
  })

  it('last 30 days is today and the 29 days before it, inclusive', () => {
    expect(monthWindow(noon)).toEqual({ start: '2026-09-13', end: '2026-10-12' })
  })

  it('includes both edges and excludes the day outside each edge', () => {
    const w = weekWindow(noon)
    expect(isInWindow('2026-10-06', w)).toBe(true)
    expect(isInWindow('2026-10-12', w)).toBe(true)
    expect(isInWindow('2026-10-05', w)).toBe(false)
    expect(isInWindow('2026-10-13', w)).toBe(false)
  })

  it('slides with the clock — there is no Monday reset', () => {
    expect(weekWindow(ist('2026-10-13', '12:00'))).toEqual({ start: '2026-10-07', end: '2026-10-13' })
  })

  it('ends on the streak reference day, so it does not slide before 05:00 IST', () => {
    expect(weekWindow(ist('2026-10-13', '04:59'))).toEqual({ start: '2026-10-06', end: '2026-10-12' })
    expect(weekWindow(ist('2026-10-13', '05:00'))).toEqual({ start: '2026-10-07', end: '2026-10-13' })
  })

  it('a 1-day window is just today; nonsense lengths are clamped to 1', () => {
    expect(rollingWindow(1, noon)).toEqual({ start: '2026-10-12', end: '2026-10-12' })
    expect(rollingWindow(0, noon)).toEqual({ start: '2026-10-12', end: '2026-10-12' })
  })

  it('counts distinct days inside the window', () => {
    const days = ['2026-10-05', '2026-10-06', '2026-10-06', '2026-10-09', '2026-10-12', '2026-10-13']
    expect(countDaysInWindow(days, weekWindow(noon))).toBe(3)
  })
})
