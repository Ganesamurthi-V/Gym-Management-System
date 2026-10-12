/**
 * `get_member_gamification()` JSON -> `MemberGamification`.
 *
 * The RPC returns NULL for a caller with no linked member row (and the client
 * returns null on error), so this always yields a usable zero state instead of
 * making every page handle "no data" separately.
 */

import { DEFAULT_GAMIFICATION_SETTINGS, XP_PER_LEVEL } from './constants'
import type { MemberGamification } from './types'

/** The JSON object exactly as the RPC returns it. */
export interface MemberGamificationRpc {
  xp: number
  level_xp_per_level: number
  streak: number
  streak_pending: boolean
  longest_streak: number
  total_days: number
  days_last_7: number
  days_last_30: number
  attended_today: boolean
  weekly_goal_days: number
  memberships: number
  portal_activated: boolean
  leaderboards_enabled: boolean
  show_on_leaderboard: boolean
  total_morning: number
  badge_rules: Record<string, number>
  weekly_prize: string | null
  monthly_prize: string | null
  /** Legacy aliases of total_days / days_last_7 / days_last_30. */
  total_attendance: number
  this_week: number
  this_month: number
}

function int(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function mapMemberGamification(data: unknown): MemberGamification {
  const g = (typeof data === 'object' && data !== null ? data : {}) as Partial<
    Record<keyof MemberGamificationRpc, unknown>
  >

  const badgeRules: Record<string, number> = {}
  if (typeof g.badge_rules === 'object' && g.badge_rules !== null && !Array.isArray(g.badge_rules)) {
    for (const [code, value] of Object.entries(g.badge_rules)) {
      if (typeof value === 'number' && Number.isFinite(value)) badgeRules[code] = value
    }
  }

  return {
    xp: int(g.xp),
    xpPerLevel: int(g.level_xp_per_level, XP_PER_LEVEL) || XP_PER_LEVEL,
    streak: int(g.streak),
    streakPending: g.streak_pending === true,
    longestStreak: int(g.longest_streak),
    totalDays: int(g.total_days),
    daysLast7: int(g.days_last_7),
    daysLast30: int(g.days_last_30),
    attendedToday: g.attended_today === true,
    weeklyGoalDays: int(g.weekly_goal_days, DEFAULT_GAMIFICATION_SETTINGS.weeklyGoalDays)
      || DEFAULT_GAMIFICATION_SETTINGS.weeklyGoalDays,
    memberships: int(g.memberships),
    portalActivated: g.portal_activated === true,
    // Default true: a missing value must not hide a board the gym has enabled.
    leaderboardsEnabled: g.leaderboards_enabled !== false,
    showOnLeaderboard: g.show_on_leaderboard !== false,
    totalMorning: int(g.total_morning),
    badgeRules,
    weeklyPrize: text(g.weekly_prize),
    monthlyPrize: text(g.monthly_prize),
  }
}
