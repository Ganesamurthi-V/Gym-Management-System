/**
 * Attended days and streaks (lib/gamification/streak.ts).
 *
 * These pin the rules the SQL functions implement too:
 *  - a day counts once however many sessions it has
 *  - a check-in saved shortly after midnight keeps the previous day's streak
 *  - the streak number never includes a day that has no check-in yet
 */

import { describe, it, expect } from 'vitest'
import { attendedDays, computeStreak, effectiveDay, streakFromDays } from '@/lib/gamification/streak'
import type { AttendanceStamp } from '@/lib/gamification/types'

/** An instant given as IST wall-clock time. */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`)

/** A normal kiosk check-in: saved on its own date, in the evening unless told otherwise. */
const row = (date: string, savedTime = '18:00', savedDate = date): AttendanceStamp => ({
  date,
  createdAt: ist(savedDate, savedTime).toISOString(),
})

const OCT_9_TO_11 = [row('2026-10-09'), row('2026-10-10'), row('2026-10-11')]

describe('attendedDays', () => {
  it('counts morning and evening on the same day once', () => {
    const rows = [row('2026-10-12', '06:30'), row('2026-10-12', '19:00')]
    expect(attendedDays(rows)).toEqual(['2026-10-12'])
    expect(computeStreak(rows, ist('2026-10-12', '20:00')).streak).toBe(1)
  })

  it('returns distinct days in ascending order', () => {
    const rows = [row('2026-10-11'), row('2026-10-09'), row('2026-10-11', '07:00'), row('2026-10-10')]
    expect(attendedDays(rows)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11'])
  })

  it('treats a row with no save time as its own date', () => {
    expect(attendedDays([{ date: '2026-10-12', createdAt: null }])).toEqual(['2026-10-12'])
    expect(attendedDays([{ date: '2026-10-12', createdAt: 'not a date' }])).toEqual(['2026-10-12'])
  })
})

describe('effective day of a check-in saved just after midnight', () => {
  it('00:30 with nothing recorded yesterday counts for yesterday', () => {
    const late = row('2026-10-13', '00:30')
    expect(attendedDays([...OCT_9_TO_11, late])).toEqual([
      '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12',
    ])
  })

  it('04:59 with nothing recorded yesterday counts for yesterday', () => {
    expect(effectiveDay(row('2026-10-13', '04:59'), () => false)).toBe('2026-10-12')
  })

  it('05:00 and 05:01 count for the new day', () => {
    expect(effectiveDay(row('2026-10-13', '05:00'), () => false)).toBe('2026-10-13')
    expect(effectiveDay(row('2026-10-13', '05:01'), () => false)).toBe('2026-10-13')
  })

  it('00:30 counts for the new day when yesterday already has a check-in', () => {
    const rows = [row('2026-10-12'), row('2026-10-13', '00:30')]
    expect(attendedDays(rows)).toEqual(['2026-10-12', '2026-10-13'])
  })

  it('takes an owner back-dated row as-is, even when saved before 05:00', () => {
    // Saved at 02:00 on the 13th FOR the 12th: the save date differs from the
    // attendance date, so it is an edit, not a late check-in. It must not slide
    // to the 11th.
    const backdated = row('2026-10-12', '02:00', '2026-10-13')
    expect(attendedDays([row('2026-10-10'), backdated])).toEqual(['2026-10-10', '2026-10-12'])
  })

  it('takes a forward-dated row as-is', () => {
    const forward = row('2026-10-14', '02:00', '2026-10-13')
    expect(effectiveDay(forward, () => false)).toBe('2026-10-14')
  })

  it('does not cascade: the previous-day check looks at recorded dates, not shifted ones', () => {
    // The 13th's row slides to the 12th. The 14th's row then finds a RECORDED
    // row dated the 13th, so it stays on the 14th.
    const rows = [row('2026-10-13', '00:30'), row('2026-10-14', '00:30')]
    expect(attendedDays(rows)).toEqual(['2026-10-12', '2026-10-14'])
  })
})

describe('streak across the midnight tolerance', () => {
  it('a check-in saved at 00:30 rescues the streak', () => {
    const now = ist('2026-10-13', '00:40')
    const before = computeStreak(OCT_9_TO_11, now)
    expect(before.streak).toBe(3) // still alive, nothing lost yet

    const after = computeStreak([...OCT_9_TO_11, row('2026-10-13', '00:30')], now)
    expect(after.streak).toBe(4)
    expect(after.lastAttendedDay).toBe('2026-10-12')
    // It filled yesterday; the new calendar day is still open.
    expect(after.streakPending).toBe(true)
  })

  it('a check-in saved at 04:59 rescues the streak', () => {
    const after = computeStreak([...OCT_9_TO_11, row('2026-10-13', '04:59')], ist('2026-10-13', '04:59'))
    expect(after.streak).toBe(4)
  })

  it('a check-in saved at 05:01 does not: the streak restarts at 1', () => {
    const now = ist('2026-10-13', '05:02')
    expect(computeStreak(OCT_9_TO_11, now).streak).toBe(0)

    const after = computeStreak([...OCT_9_TO_11, row('2026-10-13', '05:01')], now)
    expect(after.streak).toBe(1)
    expect(after.streakPending).toBe(false)
    expect(after.longestStreak).toBe(3)
  })

  it('with yesterday attended, a 00:30 check-in extends the streak into the new day', () => {
    const rows = [row('2026-10-10'), row('2026-10-11'), row('2026-10-12'), row('2026-10-13', '00:30')]
    const result = computeStreak(rows, ist('2026-10-13', '00:40'))
    expect(result.streak).toBe(4)
    expect(result.streakPending).toBe(false)
    expect(result.attendedToday).toBe(true)
  })

  it('keeps showing the streak (pending) through the small hours, then drops it', () => {
    const rows = [row('2026-10-09'), row('2026-10-10'), row('2026-10-11')]
    // The 12th passed with no check-in.
    expect(computeStreak(rows, ist('2026-10-12', '23:50'))).toMatchObject({ streak: 3, streakPending: true })
    expect(computeStreak(rows, ist('2026-10-13', '00:10'))).toMatchObject({ streak: 3, streakPending: true })
    expect(computeStreak(rows, ist('2026-10-13', '04:59'))).toMatchObject({ streak: 3, streakPending: true })
    expect(computeStreak(rows, ist('2026-10-13', '05:00'))).toMatchObject({ streak: 0, streakPending: false })
  })
})

describe('streakPending', () => {
  const morning = ist('2026-10-12', '10:00')

  it('is true before today\'s check-in, and the count does not include today', () => {
    const result = computeStreak(OCT_9_TO_11, morning)
    expect(result.streak).toBe(3)
    expect(result.streakPending).toBe(true)
    expect(result.attendedToday).toBe(false)
  })

  it('the count is unchanged all day until the check-in exists', () => {
    for (const time of ['00:10', '05:00', '10:00', '18:00', '23:50']) {
      expect(computeStreak(OCT_9_TO_11, ist('2026-10-12', time)).streak, time).toBe(3)
    }
  })

  it('is false after today\'s check-in, and the count goes up by exactly one', () => {
    const result = computeStreak([...OCT_9_TO_11, row('2026-10-12', '10:05')], ist('2026-10-12', '10:06'))
    expect(result.streak).toBe(4)
    expect(result.streakPending).toBe(false)
    expect(result.attendedToday).toBe(true)
  })

  it('is false when there is no streak to keep', () => {
    expect(computeStreak([], morning)).toEqual({
      streak: 0, streakPending: false, longestStreak: 0, lastAttendedDay: null, attendedToday: false,
    })
    expect(computeStreak([row('2026-10-05')], morning)).toMatchObject({ streak: 0, streakPending: false })
  })

  it('a first-ever check-in today is a streak of 1, not pending', () => {
    expect(computeStreak([row('2026-10-12', '09:00')], morning)).toMatchObject({ streak: 1, streakPending: false })
  })
})

describe('longestStreak', () => {
  it('is the longest run ever, independent of the current one', () => {
    const rows = [
      row('2026-10-01'), row('2026-10-02'), row('2026-10-03'), row('2026-10-04'), row('2026-10-05'),
      // gap
      row('2026-10-10'), row('2026-10-11'), row('2026-10-12'),
    ]
    const result = computeStreak(rows, ist('2026-10-12', '20:00'))
    expect(result.streak).toBe(3)
    expect(result.longestStreak).toBe(5)
  })

  it('survives after the current streak has lapsed', () => {
    const result = computeStreak(OCT_9_TO_11, ist('2026-10-20', '12:00'))
    expect(result.streak).toBe(0)
    expect(result.longestStreak).toBe(3)
    expect(result.lastAttendedDay).toBe('2026-10-11')
  })

  it('runs cross month boundaries', () => {
    const rows = [row('2026-09-29'), row('2026-09-30'), row('2026-10-01'), row('2026-10-02')]
    expect(computeStreak(rows, ist('2026-10-02', '21:00')).streak).toBe(4)
  })
})

describe('streakFromDays', () => {
  it('ignores days dated after today (forward-dated by the owner)', () => {
    const days = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']
    const result = streakFromDays(days, ist('2026-10-12', '12:00'))
    expect(result.streak).toBe(2)
    expect(result.longestStreak).toBe(2)
    expect(result.lastAttendedDay).toBe('2026-10-12')
  })

  it('tolerates unsorted and duplicated input', () => {
    const days = ['2026-10-12', '2026-10-10', '2026-10-11', '2026-10-11']
    expect(streakFromDays(days, ist('2026-10-12', '12:00')).streak).toBe(3)
  })
})
