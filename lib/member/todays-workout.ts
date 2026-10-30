/**
 * Which workout to show a member on the home screen today.
 *
 * A program's `schedule` is an object keyed by weekday ('Mon'..'Sun'), each holding the exercises for
 * that day (see app/m/workout/WorkoutDetail.tsx, which reads the same shape). A day with no exercises
 * is a rest day.
 *
 * "Today" is the Asia/Kolkata calendar date (callers pass `todayIST()`), never the server's UTC day:
 * between 00:00 and 05:30 IST the server is still on yesterday.
 */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]

/** The programs' shape this needs; the real row has many more columns. */
export interface ProgramLike {
  id: string
  name: string
  schedule: unknown
}

export interface TodaysWorkout {
  programId: string
  programName: string
  day: Weekday
  exerciseCount: number
  /** The first few exercise names, for the card. */
  exerciseNames: string[]
}

export type WorkoutToday =
  | { kind: 'none' }
  | { kind: 'workout'; workout: TodaysWorkout }
  | { kind: 'rest'; nextDay: Weekday | null }

/** Weekday of a 'YYYY-MM-DD' calendar date. A date has no time zone, so UTC is exact. */
export function weekdayOf(date: string): Weekday {
  const sunday0 = new Date(`${date}T00:00:00Z`).getUTCDay()
  return WEEKDAYS[sunday0 === 0 ? 6 : sunday0 - 1]
}

function exercisesOn(schedule: unknown, day: Weekday): { name?: unknown }[] {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return []
  const entries = (schedule as Record<string, unknown>)[day]
  return Array.isArray(entries) ? (entries as { name?: unknown }[]) : []
}

const NAMES_SHOWN = 3

/**
 * `programs` is the member's assigned, published programs, newest first. The first one that has
 * exercises today is shown. If none does, it is a rest day, and the next day that has a workout is named.
 */
export function workoutToday(programs: readonly ProgramLike[], date: string): WorkoutToday {
  if (programs.length === 0) return { kind: 'none' }
  const today = weekdayOf(date)

  for (const program of programs) {
    const exercises = exercisesOn(program.schedule, today)
    if (exercises.length === 0) continue
    const names = exercises
      .map(e => (typeof e.name === 'string' ? e.name.trim() : ''))
      .filter(Boolean)
    return {
      kind: 'workout',
      workout: {
        programId: program.id,
        programName: program.name,
        day: today,
        exerciseCount: exercises.length,
        exerciseNames: names.slice(0, NAMES_SHOWN),
      },
    }
  }

  // Rest day: look ahead through the week for the next day with any exercises.
  const start = WEEKDAYS.indexOf(today)
  for (let i = 1; i <= 7; i++) {
    const day = WEEKDAYS[(start + i) % 7]
    if (programs.some(p => exercisesOn(p.schedule, day).length > 0)) return { kind: 'rest', nextDay: day }
  }
  // Programs exist but none has a single exercise yet.
  return { kind: 'rest', nextDay: null }
}

/** Cookie holding the program a member picked with "For me" when several are assigned. Read on the server for the home card. */
export const MY_PROGRAM_COOKIE = 'gf-my-program'

/**
 * With several assigned programs the member can pick one ("For me"); the home screen then considers only
 * that one. An unknown or stale id (program unassigned since) falls back to all programs, so the card never goes blank.
 */
export function programsForHome<T extends ProgramLike>(programs: readonly T[], chosenId: string | undefined): readonly T[] {
  if (programs.length < 2 || !chosenId) return programs
  const chosen = programs.find(p => p.id === chosenId)
  return chosen ? [chosen] : programs
}
