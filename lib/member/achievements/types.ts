/**
 * Achievement Rarity System — Type Definitions
 *
 * These types drive the entire achievement system: definitions, evaluation,
 * and rendering. They are intentionally separate from the database types
 * because achievements are computed from multiple data sources, not stored.
 */

export type AchievementRarity =
  | 'common'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic'

export type AchievementCategory =
  | 'attendance'
  | 'streak'
  | 'workout'     // only activate when workout data exists in DB
  | 'membership'
  | 'xp'
  | 'special'

export interface Achievement {
  id: string
  name: string
  description: string
  category: AchievementCategory
  rarity: AchievementRarity
  /** Threshold value for unlock (check-ins, streak days, XP, etc.) */
  requirement: number
  icon: string // emoji
  /** Path to badge image in /public/badges/ (e.g. '/badges/century_club.webp') */
  badgeImage?: string
  /** Optional scale override for badges with extra internal whitespace (e.g. '1.4') */
  badgeScale?: number
  /** Optional pixel size override for the badge image (default: 52px) */
  badgeSize?: number
  unlocked: boolean
  unlockedAt?: string // ISO timestamp
  /** Current progress toward requirement. Omit if not measurable. */
  progress?: number
  /** If true, the underlying data source is not yet available */
  pendingBackend?: boolean
}

/**
 * Stats shape consumed by the evaluator.
 * Adapted to match what the existing `get_member_gamification` RPC returns
 * plus extra fields derived from raw queries.
 */
export interface MemberStats {
  totalCheckins: number
  currentStreak: number
  weeklyCheckins: number
  monthlyCheckins: number
  totalWorkouts?: number         // optional — only if table exists
  renewalCount: number
  membershipStartDate: string    // ISO
  totalXP: number
  earlyMorningCheckins?: number  // optional — only if time data exists
  portalActivated: boolean
}

/** The static rarity ordering from most prestigious to least. */
export const RARITY_ORDER: AchievementRarity[] = [
  'mythic',
  'legendary',
  'epic',
  'rare',
  'common',
]
