import { describe, expect, it } from 'vitest'
import { upcomingWorkouts } from '@/lib/member/todays-workout'

const ex = (...names: string[]) => names.map(name => ({ name }))
// 2026-10-27 is a Tuesday.
const programs = [{ id: 'p', name: 'Split', schedule: { Tue: ex('Bench', 'Row', 'Curl', 'Dips'), Thu: ex('Squat'), Sat: ex('Deadlift') } }]

describe('upcomingWorkouts', () => {
  it('includes today when it is scheduled', () => {
    const r = upcomingWorkouts(programs, '2026-10-27', 1)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      date: '2026-10-27',
      weekday: 'Tue',
      isToday: true,
      programId: 'p',
      programName: 'Split',
      dayName: null,
      exerciseCount: 4,
      exerciseNames: ['Bench', 'Row', 'Curl'],
    })
  })

  it('skips rest days', () => {
    const r = upcomingWorkouts(programs, '2026-10-28', 2)
    expect(r.map(w => w.weekday)).toEqual(['Thu', 'Sat'])
    expect(r.every(w => !w.isToday)).toBe(true)
  })

  it('wraps across the week and month', () => {
    const r = upcomingWorkouts(programs, '2026-10-31', 3)
    expect(r.map(w => w.date)).toEqual(['2026-10-31', '2026-11-03', '2026-11-05'])
    expect(r.map(w => w.weekday)).toEqual(['Sat', 'Tue', 'Thu'])
  })

  it('respects count', () => {
    expect(upcomingWorkouts(programs, '2026-10-27', 2)).toHaveLength(2)
    expect(upcomingWorkouts(programs, '2026-10-27', 0)).toEqual([])
  })

  it('returns [] with no programs or no exercises', () => {
    expect(upcomingWorkouts([], '2026-10-27', 3)).toEqual([])
    expect(upcomingWorkouts([{ id: 'x', name: 'Empty', schedule: {} }], '2026-10-27', 3)).toEqual([])
  })
})
