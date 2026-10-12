/**
 * Attended days and streaks. Pure, and an exact mirror of the SQL in
 * `get_member_gamification` / `get_gym_leaderboard`.
 *
 * RULES
 * 1. Attended days are DISTINCT days: morning + evening on one day is one day.
 * 2. Effective day of a row is normally its `date`. If the row was saved before
 *    05:00 IST on that same calendar date AND the member has no row for the
 *    previous date, it counts for the previous date instead — a check-in just
 *    after midnight keeps yesterday's streak alive. If yesterday already has a
 *    row, it counts for the new day. A row whose save date differs from its
 *    `date` was back/forward-dated by the owner and is taken as-is.
 * 3. A streak is alive while its most recent attended day is >= gymToday - 1,
 *    where gymToday is the IST date of (now - 5h). Otherwise it is 0.
 * 4. Today is never counted in advance. `streakPending` is true when the streak
 *    is alive but nothing is recorded for the real IST calendar today.
 *
 * The 5 hours is DAY_ROLLOVER_GRACE_HOURS and is intentionally silent: the UI
 * shows only the streak and the pending flag, never the tolerance or how long
 * is left. Do not add copy that reveals it.
 */

import { DAY_ROLLOVER_GRACE_HOURS } from './constants'
import { addDays, gymToday, istDateOf, istMinutesOfDay, istToday } from './periods'
import type { AttendanceStamp, DateString, StreakResult } from './types'

/**
 * The day one attendance row counts for (rule 2).
 * `hasRowOn` answers "does this member have ANY raw row with this date?" — it is
 * asked about raw dates, not effective days, so the rule cannot cascade.
 */
export function effectiveDay(
  row: AttendanceStamp,
  hasRowOn: (date: DateString) => boolean,
): DateString {
  if (row.createdAt == null) return row.date
  const savedAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
  if (Number.isNaN(savedAt.getTime())) return row.date

  // Saved on a different calendar date than it is for: owner back-dated it.
  if (istDateOf(savedAt) !== row.date) return row.date
  if (istMinutesOfDay(savedAt) >= DAY_ROLLOVER_GRACE_HOURS * 60) return row.date

  const previous = addDays(row.date, -1)
  return hasRowOn(previous) ? row.date : previous
}

/** Distinct effective days for one member's rows, ascending (rule 1 + 2). */
export function attendedDays(rows: readonly AttendanceStamp[]): DateString[] {
  const rawDates = new Set(rows.map(r => r.date))
  const days = new Set<DateString>()
  for (const row of rows) days.add(effectiveDay(row, d => rawDates.has(d)))
  return [...days].sort()
}

/** Lengths of consecutive-day runs, with each run's last day. Input must be sorted ascending and distinct. */
function runsOf(days: readonly DateString[]): Array<{ length: number; lastDay: DateString }> {
  const runs: Array<{ length: number; lastDay: DateString }> = []
  for (const day of days) {
    const last = runs[runs.length - 1]
    if (last && addDays(last.lastDay, 1) === day) {
      last.length++
      last.lastDay = day
    } else {
      runs.push({ length: 1, lastDay: day })
    }
  }
  return runs
}

/**
 * Streak state from already-computed attended days (rules 3 + 4).
 * Days after the real IST today (forward-dated by the owner) are ignored: they
 * cannot be part of a streak that has not happened yet.
 */
export function streakFromDays(
  days: readonly DateString[],
  now: Date | string | number = new Date(),
): StreakResult {
  const today = istToday(now)
  const reference = gymToday(now)
  const usable = [...new Set(days)].filter(d => d <= today).sort()
  const runs = runsOf(usable)

  let longestStreak = 0
  for (const run of runs) if (run.length > longestStreak) longestStreak = run.length

  const current = runs[runs.length - 1]
  if (!current) {
    return { streak: 0, streakPending: false, longestStreak: 0, lastAttendedDay: null, attendedToday: false }
  }

  const alive = current.lastDay >= addDays(reference, -1)
  return {
    streak: alive ? current.length : 0,
    streakPending: alive && current.lastDay < today,
    longestStreak,
    lastAttendedDay: current.lastDay,
    attendedToday: current.lastDay === today,
  }
}

/** Streak state straight from attendance rows. */
export function computeStreak(
  rows: readonly AttendanceStamp[],
  now: Date | string | number = new Date(),
): StreakResult {
  return streakFromDays(attendedDays(rows), now)
}
