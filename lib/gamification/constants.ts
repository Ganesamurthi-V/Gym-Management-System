/**
 * Gamification constants.
 *
 * These mirror the SQL in supabase-schema.sql ("Gamification" functions). The
 * database is the source of truth at runtime; the values here exist so the same
 * rules can be unit-tested and reused by UI code. Change both together.
 */

import type { GamificationSettings, LeaderboardBoard } from './types'

/** Every gamification date is an Asia/Kolkata date, never the server's UTC date. */
export const IST_TIME_ZONE = 'Asia/Kolkata'

/**
 * IST is UTC+05:30 all year (India has no daylight saving), so a fixed offset
 * is exact and avoids Intl time-zone lookups on the hot path.
 */
export const IST_OFFSET_MINUTES = 330

/** One level per 300 XP. */
export const XP_PER_LEVEL = 300

/**
 * Hours after midnight IST during which a day has not "rolled over" yet for
 * streak purposes (see streak.ts).
 *
 * INTERNAL: this is deliberately never shown to users. It is not an owner
 * setting, and no member/owner copy, WhatsApp template or doc may mention it or
 * a countdown derived from it. Mirrored as the literal 5 in the SQL functions.
 */
export const DAY_ROLLOVER_GRACE_HOURS = 5

export const LEADERBOARD_BOARDS = ['week', 'month', 'streak', 'all'] as const

/**
 * "Last 7 days", not "This week": the windows are rolling, so there is no
 * Monday reset and the label must not promise one.
 */
export const LEADERBOARD_BOARD_LABELS: Record<LeaderboardBoard, string> = {
  week: 'Last 7 days',
  month: 'Last 30 days',
  streak: 'Streaks',
  all: 'All-time XP',
}

/** Rolling window length in days for the boards that have one. */
export const BOARD_WINDOW_DAYS = { week: 7, month: 30 } as const

export const DEFAULT_LEADERBOARD_LIMIT = 50
export const MAX_LEADERBOARD_LIMIT = 200

/** Bounds shared by the zod schema and the database CHECK constraints. */
export const SETTINGS_LIMITS = {
  xpPerCheckin: { min: 0, max: 100 },
  xpPerRenewal: { min: 0, max: 500 },
  xpPortalActivation: { min: 0, max: 500 },
  weeklyGoalDays: { min: 1, max: 7 },
  multiplierFactor: { min: 1, max: 5 },
  maxMultipliers: 20,
  multiplierLabelMax: 40,
  badgeThreshold: { min: 1, max: 10000 },
  maxBadgeRules: 50,
  prizeMax: 120,
} as const

/** Achievement codes, e.g. "att-consistency-king". Same pattern as the SQL check. */
export const ACHIEVEMENT_CODE_PATTERN = /^[a-z0-9-]{1,60}$/

/**
 * Used when a gym has no settings row. Equal to the values that were hardcoded
 * before settings existed, so an untouched gym keeps its XP numbers.
 */
export const DEFAULT_GAMIFICATION_SETTINGS: GamificationSettings = {
  leaderboardsEnabled: true,
  xpPerCheckin: 10,
  xpPerRenewal: 50,
  xpPortalActivation: 25,
  weeklyGoalDays: 4,
  xpMultipliers: [],
  badgeRules: {},
  weeklyPrize: null,
  monthlyPrize: null,
}
