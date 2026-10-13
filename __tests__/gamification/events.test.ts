/**
 * Gamification events (lib/gamification/events.ts): schema rules and the three
 * progress functions. Mirrors the SQL in gym_event_progress().
 */

import { describe, it, expect } from 'vitest'
import {
  checkinDays,
  createEventSchema,
  eventProgress,
  longSessionDays,
  longestStreakInWindow,
  updateEventSchema,
  type EventAttendanceRow,
  type EventRule,
} from '@/lib/gamification/events'
import { mapMemberEvents } from '@/lib/gamification/mapEvents'
import { computeXp } from '@/lib/gamification/xp'
import { DEFAULT_GAMIFICATION_SETTINGS } from '@/lib/gamification/constants'

// 2026-10-13 12:00 IST. Rows below are saved mid-day IST (06:30Z = 12:00 IST)
// unless a test is about the 05:00 rollover.
const NOW = new Date('2026-10-13T06:30:00Z')

function row(date: string, over: Partial<EventAttendanceRow> = {}): EventAttendanceRow {
  return { date, createdAt: `${date}T06:30:00Z`, session: 'morning', checkOutTime: null, ...over }
}

/** Row with a check-out `minutes` after it was saved. */
function session(date: string, minutes: number, over: Partial<EventAttendanceRow> = {}): EventAttendanceRow {
  const out = new Date(new Date(`${date}T06:30:00Z`).getTime() + minutes * 60_000).toISOString()
  return row(date, { checkOutTime: out, ...over })
}

const WIN = { start: '2026-10-01', end: '2026-10-13' }

const validCreate = {
  title: 'Seven days',
  goalType: 'checkin_days' as const,
  goalTarget: 7,
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  rewardXp: 200,
}

describe('createEventSchema', () => {
  it('accepts a minimal valid payload and normalises optionals', () => {
    const r = createEventSchema.parse(validCreate)
    expect(r).toMatchObject({
      description: null,
      minSessionMinutes: null,
      sessionFilter: null,
      rewardText: null,
      isActive: true,
    })
  })

  it('trims text and turns empty optional text into null', () => {
    const r = createEventSchema.parse({ ...validCreate, title: '  Hi  ', description: '   ', rewardText: '' })
    expect(r.title).toBe('Hi')
    expect(r.description).toBeNull()
    expect(r.rewardText).toBeNull()
  })

  it('rejects empty and over-long titles', () => {
    expect(createEventSchema.safeParse({ ...validCreate, title: '  ' }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, title: 'x'.repeat(61) }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, title: 'x'.repeat(60) }).success).toBe(true)
  })

  it('bounds the goal target to 1..365', () => {
    expect(createEventSchema.safeParse({ ...validCreate, goalTarget: 0 }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, goalTarget: 366 }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, goalTarget: 1.5 }).success).toBe(false)
  })

  it('requires minSessionMinutes (15..720) for long_sessions only', () => {
    const long = { ...validCreate, goalType: 'long_sessions' as const }
    expect(createEventSchema.safeParse(long).success).toBe(false)
    expect(createEventSchema.safeParse({ ...long, minSessionMinutes: 14 }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...long, minSessionMinutes: 721 }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...long, minSessionMinutes: 120 }).success).toBe(true)
    expect(createEventSchema.safeParse({ ...validCreate, minSessionMinutes: 120 }).success).toBe(false)
  })

  it('does not allow a session filter on a streak', () => {
    const streak = { ...validCreate, goalType: 'streak_days' as const }
    expect(createEventSchema.safeParse({ ...streak, sessionFilter: 'morning' }).success).toBe(false)
    expect(createEventSchema.safeParse(streak).success).toBe(true)
    expect(createEventSchema.safeParse({ ...validCreate, sessionFilter: 'evening' }).success).toBe(true)
    expect(createEventSchema.safeParse({ ...validCreate, sessionFilter: 'night' }).success).toBe(false)
  })

  it('validates the window: real dates, end >= start, at most 366 days', () => {
    expect(createEventSchema.safeParse({ ...validCreate, startDate: '2026-02-30' }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, endDate: '2026-09-30' }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, endDate: '2026-10-01' }).success).toBe(true)
    // 2026-10-01 + 365 days = 2027-10-01 (366 days inclusive) is the maximum.
    expect(createEventSchema.safeParse({ ...validCreate, endDate: '2027-10-01' }).success).toBe(true)
    expect(createEventSchema.safeParse({ ...validCreate, endDate: '2027-10-02' }).success).toBe(false)
  })

  it('needs XP, an item reward, or both; bounds XP to 0..1000 and text to 80', () => {
    expect(createEventSchema.safeParse({ ...validCreate, rewardXp: 0 }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, rewardXp: 0, rewardText: 'Shaker' }).success).toBe(true)
    expect(createEventSchema.safeParse({ ...validCreate, rewardXp: 1001 }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, rewardXp: -1, rewardText: 'x' }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validCreate, rewardText: 'x'.repeat(81) }).success).toBe(false)
    const { rewardXp: _omit, ...noXp } = validCreate
    expect(createEventSchema.safeParse({ ...noXp, rewardText: 'Shaker' }).success).toBe(true)
    expect(createEventSchema.safeParse(noXp).success).toBe(false)
  })

  it('rejects unknown keys', () => {
    expect(createEventSchema.safeParse({ ...validCreate, gymId: 'x' }).success).toBe(false)
  })
})

describe('updateEventSchema', () => {
  it('does not inject defaults for fields that were not sent', () => {
    expect(updateEventSchema.parse({ title: 'New' })).toEqual({ title: 'New' })
  })

  it('still validates what is sent', () => {
    expect(updateEventSchema.safeParse({ rewardXp: 5000 }).success).toBe(false)
    expect(updateEventSchema.safeParse({ isActive: false }).success).toBe(true)
  })

  it('allows clearing optional text with null or an empty string', () => {
    expect(updateEventSchema.parse({ rewardText: '' })).toEqual({ rewardText: null })
    expect(updateEventSchema.parse({ description: null })).toEqual({ description: null })
  })
})

describe('checkinDays', () => {
  it('counts distinct days; morning + evening on one day is one day', () => {
    const rows = [
      row('2026-10-02'),
      row('2026-10-02', { session: 'evening' }),
      row('2026-10-05'),
    ]
    expect(checkinDays(rows, WIN)).toBe(2)
  })

  it('includes both window edges and excludes days outside', () => {
    const rows = [row('2026-09-30'), row('2026-10-01'), row('2026-10-13'), row('2026-10-14')]
    expect(checkinDays(rows, WIN)).toBe(2)
  })

  it('honours the session filter', () => {
    const rows = [
      row('2026-10-02', { session: 'morning' }),
      row('2026-10-03', { session: 'evening' }),
      row('2026-10-04', { session: 'evening' }),
      row('2026-10-05', { session: null }),
    ]
    expect(checkinDays(rows, WIN, 'evening')).toBe(2)
    expect(checkinDays(rows, WIN, 'morning')).toBe(1)
    expect(checkinDays(rows, WIN, null)).toBe(4)
  })

  it('a day with a morning AND an evening row counts for either filter', () => {
    const rows = [row('2026-10-02', { session: 'morning' }), row('2026-10-02', { session: 'evening' })]
    expect(checkinDays(rows, WIN, 'morning')).toBe(1)
    expect(checkinDays(rows, WIN, 'evening')).toBe(1)
  })

  it('uses the 5-hour rollover: a 02:00 IST save keeps the previous day when it is empty', () => {
    // 2026-10-05 02:00 IST = 2026-10-04T20:30Z, same IST date as `date`.
    const late = row('2026-10-05', { createdAt: '2026-10-04T20:30:00Z' })
    expect(checkinDays([late], { start: '2026-10-04', end: '2026-10-04' })).toBe(1)
    expect(checkinDays([late], { start: '2026-10-05', end: '2026-10-05' })).toBe(0)
    // With a real row on the 4th, the early save counts for the 5th.
    const both = [row('2026-10-04'), late]
    expect(checkinDays(both, { start: '2026-10-05', end: '2026-10-05' })).toBe(1)
  })

  it('an owner back-dated row (saved on another date) keeps its own date', () => {
    const backdated = row('2026-10-03', { createdAt: '2026-10-10T20:30:00Z' })
    expect(checkinDays([backdated], { start: '2026-10-03', end: '2026-10-03' })).toBe(1)
  })
})

describe('longestStreakInWindow', () => {
  it('finds the longest run', () => {
    const rows = ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06'].map(d => row(d))
    expect(longestStreakInWindow(rows, WIN)).toBe(3)
  })

  it('ignores duplicate rows on one day', () => {
    const rows = [row('2026-10-01'), row('2026-10-01', { session: 'evening' }), row('2026-10-02')]
    expect(longestStreakInWindow(rows, WIN)).toBe(2)
  })

  it('only counts days fully inside the window', () => {
    const rows = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map(d => row(d))
    expect(longestStreakInWindow(rows, WIN)).toBe(2)
  })

  it('is 0 with no attendance and 1 for a single day', () => {
    expect(longestStreakInWindow([], WIN)).toBe(0)
    expect(longestStreakInWindow([row('2026-10-07')], WIN)).toBe(1)
  })

  it('crosses month boundaries', () => {
    const rows = ['2026-09-30', '2026-10-01', '2026-10-02'].map(d => row(d))
    expect(longestStreakInWindow(rows, { start: '2026-09-28', end: '2026-10-05' })).toBe(3)
  })
})

describe('longSessionDays', () => {
  it('counts a session at exactly the minimum and not one minute short', () => {
    expect(longSessionDays([session('2026-10-02', 120)], WIN, 120)).toBe(1)
    expect(longSessionDays([session('2026-10-02', 119)], WIN, 120)).toBe(0)
  })

  it('never counts a session without a check-out', () => {
    expect(longSessionDays([row('2026-10-02')], WIN, 15)).toBe(0)
  })

  it('counts a day once even with two long sessions', () => {
    const rows = [session('2026-10-02', 130), session('2026-10-02', 140, { session: 'evening' })]
    expect(longSessionDays(rows, WIN, 120)).toBe(1)
  })

  it('a short session on a day does not hide a long one on the same day', () => {
    const rows = [session('2026-10-02', 20), session('2026-10-02', 150, { session: 'evening' })]
    expect(longSessionDays(rows, WIN, 120)).toBe(1)
  })

  it('honours the session filter', () => {
    const rows = [
      session('2026-10-02', 130, { session: 'morning' }),
      session('2026-10-03', 130, { session: 'evening' }),
    ]
    expect(longSessionDays(rows, WIN, 120, 'evening')).toBe(1)
    expect(longSessionDays(rows, WIN, 120)).toBe(2)
  })

  it('respects the window', () => {
    const rows = [session('2026-09-30', 200), session('2026-10-14', 200)]
    expect(longSessionDays(rows, WIN, 120)).toBe(0)
  })

  it('ignores an unparsable check-out', () => {
    expect(longSessionDays([row('2026-10-02', { checkOutTime: 'garbage' })], WIN, 15)).toBe(0)
  })
})

describe('eventProgress', () => {
  const base: EventRule = {
    goalType: 'checkin_days',
    goalTarget: 3,
    minSessionMinutes: null,
    sessionFilter: null,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  }

  it('dispatches on goal type', () => {
    const rows = [row('2026-10-01'), row('2026-10-02'), row('2026-10-04')]
    expect(eventProgress(base, rows, NOW)).toBe(3)
    expect(eventProgress({ ...base, goalType: 'streak_days' }, rows, NOW)).toBe(2)
    expect(
      eventProgress(
        { ...base, goalType: 'long_sessions', minSessionMinutes: 60 },
        [session('2026-10-01', 90), row('2026-10-02')],
        NOW,
      ),
    ).toBe(1)
  })

  it('does not count days after today (forward-dated rows)', () => {
    const rows = [row('2026-10-12'), row('2026-10-13'), row('2026-10-14'), row('2026-10-20')]
    expect(eventProgress(base, rows, NOW)).toBe(2)
    expect(eventProgress({ ...base, goalType: 'streak_days' }, rows, NOW)).toBe(2)
  })

  it('is 0 for an event that has not started', () => {
    expect(eventProgress({ ...base, startDate: '2026-10-20' }, [row('2026-10-21')], NOW)).toBe(0)
  })

  it('keeps counting an ended event inside its own window only', () => {
    const ended = { ...base, endDate: '2026-10-05' }
    expect(eventProgress(ended, [row('2026-10-05'), row('2026-10-06')], NOW)).toBe(1)
  })

  it('ignores the session filter for streaks (matches SQL)', () => {
    const rows = [row('2026-10-01', { session: 'morning' }), row('2026-10-02', { session: 'evening' })]
    expect(
      eventProgress({ ...base, goalType: 'streak_days', sessionFilter: 'morning' }, rows, NOW),
    ).toBe(2)
  })

  it('a long_sessions event without minSessionMinutes has no progress', () => {
    expect(eventProgress({ ...base, goalType: 'long_sessions' }, [session('2026-10-02', 500)], NOW)).toBe(0)
  })
})

describe('computeXp with eventXp', () => {
  const input = {
    days: ['2026-10-01', '2026-10-02'],
    memberships: 1,
    portalActivated: true,
    settings: DEFAULT_GAMIFICATION_SETTINGS,
  }
  // 2 days * 10 + 1 * 50 + 25 portal
  const base = 95

  it('is unchanged without eventXp', () => {
    expect(computeXp(input)).toBe(base)
    expect(computeXp({ ...input, eventXp: 0 })).toBe(base)
  })

  it('adds the event XP on top', () => {
    expect(computeXp({ ...input, eventXp: 200 })).toBe(base + 200)
  })

  it('ignores negative and non-finite values', () => {
    expect(computeXp({ ...input, eventXp: -50 })).toBe(base)
    expect(computeXp({ ...input, eventXp: Number.NaN })).toBe(base)
  })
})

describe('mapMemberEvents', () => {
  it('maps the RPC array and tolerates junk', () => {
    expect(mapMemberEvents(null)).toEqual([])
    expect(mapMemberEvents({})).toEqual([])
    const [e] = mapMemberEvents([
      null,
      { nope: true },
      {
        id: 'a',
        title: 'T',
        description: null,
        goalType: 'long_sessions',
        goalTarget: 3,
        minSessionMinutes: 120,
        sessionFilter: 'morning',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        rewardXp: 200,
        rewardText: 'Shaker',
        progress: 2,
        completed: false,
        completedAt: null,
        rewardGiven: false,
      },
    ])
    expect(e).toMatchObject({ id: 'a', goalType: 'long_sessions', progress: 2, rewardText: 'Shaker' })
  })
})
