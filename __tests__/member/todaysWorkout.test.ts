import { describe, expect, it } from 'vitest'
import { weekdayOf, workoutToday } from '@/lib/member/todays-workout'

const ex = (...names: string[]) => names.map(name => ({ name }))

describe('weekdayOf', () => {
  it('names the weekday of an IST calendar date', () => {
    expect(weekdayOf('2026-10-26')).toBe('Mon')
    expect(weekdayOf('2026-10-27')).toBe('Tue')
    expect(weekdayOf('2026-11-01')).toBe('Sun')
  })
})

describe('workoutToday', () => {
  it('shows nothing when no program is assigned', () => {
    expect(workoutToday([], '2026-10-27')).toEqual({ kind: 'none' })
  })

  it("returns today's exercises from the first program that has some", () => {
    const programs = [
      { id: 'a', name: 'Empty Tuesday', schedule: { Mon: ex('Squat') } },
      { id: 'b', name: 'Push Pull', schedule: { Tue: ex('Bench Press', 'Row', 'Curl', 'Dips', 'Plank') } },
    ]
    const r = workoutToday(programs, '2026-10-27')
    expect(r).toMatchObject({ kind: 'workout', workout: { programId: 'b', day: 'Tue', exerciseCount: 5 } })
    if (r.kind === 'workout') expect(r.workout.exerciseNames).toEqual(['Bench Press', 'Row', 'Curl'])
  })

  it('is a rest day when today has no exercises, and names the next workout day', () => {
    const programs = [{ id: 'a', name: 'P', schedule: { Mon: ex('Squat'), Thu: ex('Deadlift') } }]
    expect(workoutToday(programs, '2026-10-27')).toEqual({ kind: 'rest', nextDay: 'Thu' })
    // Friday looks ahead across the weekend to Monday.
    expect(workoutToday(programs, '2026-10-30')).toEqual({ kind: 'rest', nextDay: 'Mon' })
  })

  it('copes with a missing, empty or malformed schedule', () => {
    expect(workoutToday([{ id: 'a', name: 'P', schedule: null }], '2026-10-27')).toEqual({ kind: 'rest', nextDay: null })
    expect(workoutToday([{ id: 'a', name: 'P', schedule: [] }], '2026-10-27')).toEqual({ kind: 'rest', nextDay: null })
    expect(workoutToday([{ id: 'a', name: 'P', schedule: { Tue: 'oops' } }], '2026-10-27')).toEqual({ kind: 'rest', nextDay: null })
  })

  it('counts an exercise with no name but skips it in the name list', () => {
    const r = workoutToday([{ id: 'a', name: 'P', schedule: { Tue: [{ name: '' }, { name: 'Squat' }] } }], '2026-10-27')
    expect(r).toMatchObject({ kind: 'workout', workout: { exerciseCount: 2, exerciseNames: ['Squat'] } })
  })
})
