/**
 * Leaderboard copy rules (lib/gamification/leaderboardDisplay.ts): value units,
 * the motivating line, and the weekly-goal ring maths.
 */

import { describe, it, expect } from 'vitest'
import {
  STREAK_PENDING_LABEL,
  formatBoardValue,
  formatCount,
  motivationLine,
  rankedRows,
  weeklyGoalProgress,
} from '@/lib/gamification/leaderboardDisplay'
import type { LeaderboardRow } from '@/lib/gamification/types'

function row(displayName: string, rank: number, value: number, extra: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    memberId: null,
    displayName,
    rank,
    value,
    xp: 0,
    streak: 0,
    streakPending: false,
    daysLast7: 0,
    daysLast30: 0,
    isMe: false,
    totalMembers: 0,
    totalDays: 0,
    ...extra,
  }
}

const me = (rank: number, value: number) => row('Me M.', rank, value, { isMe: true, memberId: 'me' })

describe('formatBoardValue', () => {
  it('uses days on the rolling-window boards, with a singular', () => {
    expect(formatBoardValue('week', 5)).toBe('5 days')
    expect(formatBoardValue('week', 1)).toBe('1 day')
    expect(formatBoardValue('month', 18)).toBe('18 days')
    expect(formatBoardValue('month', 0)).toBe('0 days')
  })

  it('writes a streak as "N-day streak"', () => {
    expect(formatBoardValue('streak', 12)).toBe('12-day streak')
    expect(formatBoardValue('streak', 1)).toBe('1-day streak')
  })

  it('groups XP digits', () => {
    expect(formatBoardValue('all', 1240)).toBe('1,240 XP')
    expect(formatBoardValue('all', 0)).toBe('0 XP')
  })

  it('never renders a negative, fractional or NaN value', () => {
    expect(formatBoardValue('week', -3)).toBe('0 days')
    expect(formatBoardValue('all', 12.9)).toBe('12 XP')
    expect(formatBoardValue('streak', Number.NaN)).toBe('0-day streak')
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('0')
  })
})

describe('motivationLine', () => {
  it('is null for an empty board (the page shows its empty state)', () => {
    expect(motivationLine('week', [])).toBeNull()
  })

  it('names the member directly ahead and one more than the gap', () => {
    const rows = [row('Asha R.', 1, 6), row('Ravi K.', 6, 4), me(7, 3), row('Dev S.', 8, 2)]
    // 4 - 3 = 1 behind, so 2 check-ins are needed to PASS (1 would only tie).
    expect(motivationLine('week', rows)).toBe('You are #7. 2 more check-ins to pass Ravi K.')
  })

  it('uses the board unit', () => {
    expect(motivationLine('streak', [row('Ravi K.', 1, 9), me(2, 7)])).toBe(
      'You are #2. 3 more streak days to pass Ravi K.',
    )
    expect(motivationLine('all', [row('Ravi K.', 1, 1240), me(2, 1200)])).toBe(
      'You are #2. 41 more XP to pass Ravi K.',
    )
    expect(motivationLine('month', [row('Ravi K.', 1, 20), me(2, 12)])).toBe(
      'You are #2. 9 more check-ins to pass Ravi K.',
    )
  })

  it('rank 1 with a runner-up reports the lead', () => {
    const rows = [me(1, 6), row('Ravi K.', 2, 4), row('Dev S.', 3, 1)]
    expect(motivationLine('week', rows)).toBe('You are #1. Ravi K. is 2 check-ins behind.')
    expect(motivationLine('all', [me(1, 500), row('Ravi K.', 2, 499)])).toBe('You are #1. Ravi K. is 1 XP behind.')
  })

  it('rank 1 alone on the board', () => {
    expect(motivationLine('week', [me(1, 3)])).toBe('You are #1. Keep it going.')
  })

  it('a tie for first names who it is shared with', () => {
    // RANK() gives both #1; the RPC orders ties by name, so "me" may come second.
    const two = [row('Ravi K.', 1, 5), me(1, 5), row('Dev S.', 3, 2)]
    expect(motivationLine('week', two)).toBe('You share #1 with Ravi K. 1 more check-in puts you ahead.')

    const many = [row('Asha R.', 1, 5), row('Ravi K.', 1, 5), row('Dev S.', 1, 5), me(1, 5)]
    expect(motivationLine('streak', many)).toBe('You share #1 with Asha R. and 2 others. 1 more streak day puts you ahead.')
  })

  it('a tie lower down says so and still names who to pass', () => {
    const rows = [row('Asha R.', 1, 6), row('Ravi K.', 2, 4), row('Dev S.', 3, 3), me(3, 3)]
    expect(motivationLine('week', rows)).toBe('You are tied at #3. 2 more check-ins to pass Ravi K.')
  })

  it('a member with nothing to rank gets the first step, not a rank', () => {
    // The RPC includes the caller with value 0 and whatever RANK() produced.
    const rows = [row('Asha R.', 1, 6), me(2, 0)]
    expect(motivationLine('week', rows)).toBe('Check in at the gym to get on this board.')
    expect(motivationLine('streak', rows)).toBe('Check in at the gym to start a streak.')
    expect(motivationLine('all', rows)).toBe('Check in at the gym to earn your first XP.')
  })

  it('a board without the caller on it (owner view) gets the first step too', () => {
    expect(motivationLine('month', [row('Asha R.', 1, 6)])).toBe('Check in at the gym to get on this board.')
  })

  it('when pinned below the fetched limit, targets the last fetched row above', () => {
    // Rows 1..3 fetched, then the caller's own row appended from far below.
    const rows = [row('Asha R.', 1, 30), row('Ravi K.', 2, 25), row('Dev S.', 3, 20), me(41, 2)]
    expect(motivationLine('month', rows)).toBe('You are #41. 19 more check-ins to pass Dev S.')
  })

  it('never prints an empty name', () => {
    expect(motivationLine('week', [row('  ', 1, 5), me(2, 4)])).toBe(
      'You are #2. 2 more check-ins to pass the member ahead.',
    )
  })
})

describe('rankedRows', () => {
  it('drops the zero-value row the RPC adds for the caller', () => {
    const rows = [row('Asha R.', 1, 6), me(2, 0)]
    expect(rankedRows(rows).map(r => r.displayName)).toEqual(['Asha R.'])
  })
})

describe('weeklyGoalProgress', () => {
  it('reports progress against the goal', () => {
    expect(weeklyGoalProgress(3, 4)).toEqual({ done: 3, target: 4, fraction: 0.75, reached: false })
    expect(weeklyGoalProgress(4, 4)).toEqual({ done: 4, target: 4, fraction: 1, reached: true })
  })

  it('caps the ring at full when the goal is beaten', () => {
    expect(weeklyGoalProgress(6, 4)).toEqual({ done: 6, target: 4, fraction: 1, reached: true })
  })

  it('never divides by zero or goes negative', () => {
    expect(weeklyGoalProgress(-2, 0)).toEqual({ done: 0, target: 1, fraction: 0, reached: false })
    expect(weeklyGoalProgress(Number.NaN, Number.NaN)).toEqual({ done: 0, target: 1, fraction: 0, reached: false })
  })
})

describe('STREAK_PENDING_LABEL', () => {
  it('is the agreed copy and gives no deadline', () => {
    expect(STREAK_PENDING_LABEL).toBe('Check in today to keep your streak')
    expect(STREAK_PENDING_LABEL).not.toMatch(/\d|hour|until|am\b|pm\b/i)
  })
})
