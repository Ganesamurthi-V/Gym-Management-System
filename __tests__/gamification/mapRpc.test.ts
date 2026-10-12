/**
 * RPC result mappers (lib/gamification/mapLeaderboard.ts,
 * lib/gamification/mapMemberGamification.ts).
 */

import { describe, it, expect } from 'vitest'
import {
  isLeaderboardBoard,
  leaderboardRpcArgs,
  mapLeaderboard,
  mapLeaderboardRow,
  parseLeaderboardBoard,
} from '@/lib/gamification/mapLeaderboard'
import { mapMemberGamification } from '@/lib/gamification/mapMemberGamification'
import { LEADERBOARD_BOARDS, LEADERBOARD_BOARD_LABELS } from '@/lib/gamification/constants'

const rpcRow = {
  member_id: null,
  display_name: 'Akhil P.',
  rank: 2,
  value: 5,
  xp: 340,
  streak: 4,
  streak_pending: true,
  days_last_7: 5,
  days_last_30: 18,
  is_me: false,
  total_members: 37,
  total_days: 61,
}

describe('mapLeaderboardRow', () => {
  it('camelCases an RPC row', () => {
    expect(mapLeaderboardRow(rpcRow)).toEqual({
      memberId: null,
      displayName: 'Akhil P.',
      rank: 2,
      value: 5,
      xp: 340,
      streak: 4,
      streakPending: true,
      daysLast7: 5,
      daysLast30: 18,
      isMe: false,
      totalMembers: 37,
      totalDays: 61,
    })
  })

  it('keeps the member id when the RPC returns one (owner, or the caller\'s own row)', () => {
    expect(mapLeaderboardRow({ ...rpcRow, member_id: 'm-1', is_me: true })).toMatchObject({
      memberId: 'm-1',
      isMe: true,
    })
  })

  it('fills safe zero values for missing fields and rejects non-objects', () => {
    expect(mapLeaderboardRow({})).toMatchObject({ memberId: null, displayName: '', rank: 0, value: 0, isMe: false })
    expect(mapLeaderboardRow(null)).toBeNull()
    expect(mapLeaderboardRow('row')).toBeNull()
  })
})

describe('mapLeaderboard', () => {
  it('maps an array and preserves the RPC order', () => {
    const rows = mapLeaderboard([rpcRow, { ...rpcRow, rank: 3, display_name: 'Ravi K.' }])
    expect(rows.map(r => r.displayName)).toEqual(['Akhil P.', 'Ravi K.'])
  })

  it('returns [] for null (RPC error) and other non-arrays', () => {
    expect(mapLeaderboard(null)).toEqual([])
    expect(mapLeaderboard(undefined)).toEqual([])
    expect(mapLeaderboard({})).toEqual([])
  })
})

describe('board helpers', () => {
  it('there are exactly four boards, each with a label', () => {
    expect([...LEADERBOARD_BOARDS]).toEqual(['week', 'month', 'streak', 'all'])
    expect(LEADERBOARD_BOARD_LABELS).toEqual({
      week: 'Last 7 days',
      month: 'Last 30 days',
      streak: 'Streaks',
      all: 'All-time XP',
    })
  })

  it('parseLeaderboardBoard falls back for unknown input', () => {
    expect(isLeaderboardBoard('streak')).toBe(true)
    expect(isLeaderboardBoard('year')).toBe(false)
    expect(parseLeaderboardBoard('month')).toBe('month')
    expect(parseLeaderboardBoard('year')).toBe('week')
    expect(parseLeaderboardBoard(undefined, 'all')).toBe('all')
  })

  it('leaderboardRpcArgs clamps the limit to 1..200 like the SQL', () => {
    expect(leaderboardRpcArgs('week')).toEqual({ p_board: 'week', p_limit: 50 })
    expect(leaderboardRpcArgs('all', 0)).toEqual({ p_board: 'all', p_limit: 1 })
    expect(leaderboardRpcArgs('all', 9999)).toEqual({ p_board: 'all', p_limit: 200 })
    expect(leaderboardRpcArgs('all', Number.NaN)).toEqual({ p_board: 'all', p_limit: 50 })
  })

  it('never sends a gym or member id to the RPC', () => {
    expect(Object.keys(leaderboardRpcArgs('week', 10)).sort()).toEqual(['p_board', 'p_limit'])
  })
})

describe('mapMemberGamification', () => {
  it('camelCases the RPC JSON', () => {
    const g = mapMemberGamification({
      xp: 725,
      level_xp_per_level: 300,
      streak: 4,
      streak_pending: true,
      longest_streak: 9,
      total_days: 61,
      days_last_7: 5,
      days_last_30: 18,
      attended_today: false,
      weekly_goal_days: 5,
      memberships: 3,
      portal_activated: true,
      leaderboards_enabled: false,
      show_on_leaderboard: false,
      total_morning: 40,
      badge_rules: { 'att-consistency-king': 40 },
      weekly_prize: 'Shaker',
      monthly_prize: null,
    })
    expect(g).toEqual({
      xp: 725,
      xpPerLevel: 300,
      streak: 4,
      streakPending: true,
      longestStreak: 9,
      totalDays: 61,
      daysLast7: 5,
      daysLast30: 18,
      attendedToday: false,
      weeklyGoalDays: 5,
      memberships: 3,
      portalActivated: true,
      leaderboardsEnabled: false,
      showOnLeaderboard: false,
      totalMorning: 40,
      badgeRules: { 'att-consistency-king': 40 },
      weeklyPrize: 'Shaker',
      monthlyPrize: null,
    })
  })

  it('gives a usable zero state when the RPC returns null', () => {
    expect(mapMemberGamification(null)).toEqual({
      xp: 0,
      xpPerLevel: 300,
      streak: 0,
      streakPending: false,
      longestStreak: 0,
      totalDays: 0,
      daysLast7: 0,
      daysLast30: 0,
      attendedToday: false,
      weeklyGoalDays: 4,
      memberships: 0,
      portalActivated: false,
      leaderboardsEnabled: true,
      showOnLeaderboard: true,
      totalMorning: 0,
      badgeRules: {},
      weeklyPrize: null,
      monthlyPrize: null,
    })
  })
})
