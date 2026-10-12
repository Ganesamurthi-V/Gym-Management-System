/**
 * Presentation helpers for leaderboards. Pure (no React, no I/O) so the copy
 * rules are unit-tested: __tests__/gamification/leaderboardDisplay.test.ts.
 *
 * Shared by the member board (`app/m/leaderboard`), the polling hook
 * (`lib/hooks/useLeaderboard.ts`) and the API route that feeds it.
 */

import type { LeaderboardBoard, LeaderboardRow } from './types'

/** `data` of `GET /api/gamification/leaderboard` (inside the apiSuccess envelope). */
export interface LeaderboardApiData {
  board: LeaderboardBoard
  rows: LeaderboardRow[]
  /** Members on this board for this caller (0 when the board is empty). */
  totalMembers: number
  /** false when the gym has switched leaderboards off. */
  enabled: boolean
}

/**
 * The one label for a streak whose day is still open. Kept as a constant so
 * every surface (Home, Rewards, boards) says exactly the same thing, and so no
 * surface is tempted to add a deadline to it: the copy must never say how long
 * the member has left.
 */
export const STREAK_PENDING_LABEL = 'Check in today to keep your streak'

/** Indian digit grouping, fixed locale so server and client render the same text. */
export function formatCount(value: number): string {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)).toLocaleString('en-IN')
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** "5 days" / "1 day", "12-day streak", "1,240 XP". */
export function formatBoardValue(board: LeaderboardBoard, value: number): string {
  const n = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0))
  switch (board) {
    case 'week':
    case 'month':
      return `${formatCount(n)} ${plural(n, 'day', 'days')}`
    case 'streak':
      return `${formatCount(n)}-day streak`
    case 'all':
      return `${formatCount(n)} XP`
  }
}

/** "2 more check-ins", "3 more streak days", "45 more XP". */
function formatGap(board: LeaderboardBoard, gap: number): string {
  switch (board) {
    case 'week':
    case 'month':
      return `${formatCount(gap)} more ${plural(gap, 'check-in', 'check-ins')}`
    case 'streak':
      return `${formatCount(gap)} more streak ${plural(gap, 'day', 'days')}`
    case 'all':
      return `${formatCount(gap)} more XP`
  }
}

/** "2 check-ins behind", "3 streak days behind", "45 XP behind". */
function formatLead(board: LeaderboardBoard, gap: number): string {
  switch (board) {
    case 'week':
    case 'month':
      return `${formatCount(gap)} ${plural(gap, 'check-in', 'check-ins')} behind`
    case 'streak':
      return `${formatCount(gap)} streak ${plural(gap, 'day', 'days')} behind`
    case 'all':
      return `${formatCount(gap)} XP behind`
  }
}

const FIRST_STEP: Record<LeaderboardBoard, string> = {
  week: 'Check in at the gym to get on this board.',
  month: 'Check in at the gym to get on this board.',
  streak: 'Check in at the gym to start a streak.',
  all: 'Check in at the gym to earn your first XP.',
}

function nameOf(row: LeaderboardRow): string {
  return row.displayName.trim() || 'the member ahead'
}

/** "Ravi K." / "Ravi K. and 2 others". */
function tiedWith(rows: readonly LeaderboardRow[]): string {
  const first = nameOf(rows[0])
  const rest = rows.length - 1
  return rest === 0 ? first : `${first} and ${formatCount(rest)} ${plural(rest, 'other', 'others')}`
}

/**
 * The one-line nudge above a board, e.g. "You are #7. 2 more check-ins to pass
 * Ravi K." Returns null when there is nothing to say (no rows: the caller shows
 * its empty state instead).
 *
 * `rows` must be in board order, as the RPC returns them. To PASS someone you
 * need one more than the gap, because equal values share a rank.
 *
 * The target is the closest row above the member that is present in `rows`.
 * When the member sits below the fetched limit that is the last fetched row
 * rather than the member directly above, which keeps the sentence true (it
 * names a real person and a real gap) at the cost of a larger number.
 */
export function motivationLine(board: LeaderboardBoard, rows: readonly LeaderboardRow[]): string | null {
  if (rows.length === 0) return null

  const me = rows.find(r => r.isMe)
  // An owner looking at the board, or a response that lost the caller's row.
  if (!me) return FIRST_STEP[board]
  // The RPC includes the caller with a value of 0; that is not a ranking.
  if (me.value <= 0) return FIRST_STEP[board]

  const others = rows.filter(r => !r.isMe)
  const tied = others.filter(r => r.value === me.value)
  const ahead = others.filter(r => r.value > me.value)
  const behind = others.filter(r => r.value < me.value && r.value > 0)

  if (ahead.length === 0) {
    if (tied.length > 0) {
      return `${stop(`You share #1 with ${tiedWith(tied)}`)} ${capitalise(formatGap(board, 1))} puts you ahead.`
    }
    if (behind.length > 0) {
      // Rows are in board order, so the first one behind is the runner-up.
      const runnerUp = behind[0]
      return `You are #1. ${nameOf(runnerUp)} is ${formatLead(board, me.value - runnerUp.value)}.`
    }
    return 'You are #1. Keep it going.'
  }

  // Closest row above: the last one in board order whose value beats ours.
  const target = ahead[ahead.length - 1]
  const toPass = formatGap(board, target.value - me.value + 1)
  const place = tied.length > 0 ? `You are tied at #${me.rank}` : `You are #${me.rank}`
  return stop(`${place}. ${capitalise(toPass)} to pass ${nameOf(target)}`)
}

/**
 * Ends a sentence. Masked names already end in a full stop ("Ravi K."), so a
 * plain `${name}.` would print "Ravi K..".
 */
function stop(sentence: string): string {
  return sentence.endsWith('.') ? sentence : `${sentence}.`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Rows that actually hold a place: the caller's own zero-value row is not a ranking. */
export function rankedRows(rows: readonly LeaderboardRow[]): LeaderboardRow[] {
  return rows.filter(r => r.value > 0)
}

export interface WeeklyGoalProgress {
  /** Attended days in the last 7, never negative. */
  done: number
  /** The gym's target, at least 1 so the ring never divides by zero. */
  target: number
  /** 0..1 for the ring; capped, because 6 days against a goal of 4 is still a full ring. */
  fraction: number
  reached: boolean
}

export function weeklyGoalProgress(daysLast7: number, weeklyGoalDays: number): WeeklyGoalProgress {
  const done = Math.max(0, Math.trunc(Number.isFinite(daysLast7) ? daysLast7 : 0))
  const target = Math.max(1, Math.trunc(Number.isFinite(weeklyGoalDays) ? weeklyGoalDays : 1))
  return { done, target, fraction: Math.min(1, done / target), reached: done >= target }
}
