/**
 * Achievement Definitions
 *
 * Static array of all achievements. The evaluator matches member stats against
 * these requirements to determine unlock state and progress.
 *
 * IMPORTANT: `pendingBackend: true` means the underlying data source does not
 * exist in the database yet. These achievements are hidden from the UI until
 * the backend is ready.
 */

import type { Achievement } from './types'

/**
 * Base definitions without runtime state (unlocked/progress).
 * The evaluator populates those fields.
 */
type AchievementDef = Omit<Achievement, 'unlocked' | 'unlockedAt' | 'progress'>

export const ACHIEVEMENT_DEFINITIONS: AchievementDef[] = [
  // ─── Attendance ─────────────────────────────────────────────────────────────
  {
    id: 'att-welcome',
    name: 'Welcome Aboard',
    description: 'Activated Member Portal',
    category: 'attendance',
    rarity: 'common',
    requirement: 0,
    icon: '👋',
  },
  {
    id: 'att-first-checkin',
    name: 'First Check-in',
    description: '1 check-in',
    category: 'attendance',
    rarity: 'common',
    requirement: 1,
    icon: '✅',
  },
  {
    id: 'att-week-warrior',
    name: 'Week Warrior',
    description: '5 check-ins in one week',
    category: 'attendance',
    rarity: 'rare',
    requirement: 5,
    icon: '⚡',
  },
  {
    id: 'att-month-hustler',
    name: 'Month Hustler',
    description: '10 check-ins in one month',
    category: 'attendance',
    rarity: 'rare',
    requirement: 10,
    icon: '🔥',
  },
  {
    id: 'att-consistency-king',
    name: 'Consistency King',
    description: '50 total check-ins',
    category: 'attendance',
    rarity: 'epic',
    requirement: 50,
    icon: '👑',
  },
  {
    id: 'att-century-club',
    name: 'Century Club',
    description: '100 total check-ins',
    category: 'attendance',
    rarity: 'legendary',
    requirement: 100,
    icon: '💯',
  },
  {
    id: 'att-iron-veteran',
    name: 'Iron Veteran',
    description: '250 total check-ins',
    category: 'attendance',
    rarity: 'mythic',
    requirement: 250,
    icon: '🏛️',
  },

  // ─── Streak ─────────────────────────────────────────────────────────────────
  {
    id: 'str-3day',
    name: '3-Day Spark',
    description: '3-day streak',
    category: 'streak',
    rarity: 'common',
    requirement: 3,
    icon: '⚡',
  },
  {
    id: 'str-7day',
    name: '7-Day Fire',
    description: '7-day streak',
    category: 'streak',
    rarity: 'rare',
    requirement: 7,
    icon: '🔥',
  },
  {
    id: 'str-14day',
    name: '14-Day Unstoppable',
    description: '14-day streak',
    category: 'streak',
    rarity: 'epic',
    requirement: 14,
    icon: '💪',
  },
  {
    id: 'str-30day',
    name: '30-Day Beast',
    description: '30-day streak',
    category: 'streak',
    rarity: 'legendary',
    requirement: 30,
    icon: '🦁',
  },
  {
    id: 'str-90day',
    name: '90-Day Legend',
    description: '90-day streak',
    category: 'streak',
    rarity: 'mythic',
    requirement: 90,
    icon: '🏆',
  },

  // ─── Workout (pendingBackend — no workout sessions table yet) ───────────────
  {
    id: 'wrk-first',
    name: 'First Workout',
    description: 'Complete 1 workout',
    category: 'workout',
    rarity: 'common',
    requirement: 1,
    icon: '🏋️',
    pendingBackend: true,
  },
  {
    id: 'wrk-warrior',
    name: 'Workout Warrior',
    description: 'Complete 25 workouts',
    category: 'workout',
    rarity: 'rare',
    requirement: 25,
    icon: '⚔️',
    pendingBackend: true,
  },
  {
    id: 'wrk-machine',
    name: 'Training Machine',
    description: 'Complete 50 workouts',
    category: 'workout',
    rarity: 'epic',
    requirement: 50,
    icon: '🤖',
    pendingBackend: true,
  },
  {
    id: 'wrk-legend',
    name: 'Workout Legend',
    description: 'Complete 100 workouts',
    category: 'workout',
    rarity: 'legendary',
    requirement: 100,
    icon: '🌟',
    pendingBackend: true,
  },
  {
    id: 'wrk-250club',
    name: '250 Club',
    description: 'Complete 250 workouts',
    category: 'workout',
    rarity: 'mythic',
    requirement: 250,
    icon: '💎',
    pendingBackend: true,
  },

  // ─── Membership ─────────────────────────────────────────────────────────────
  {
    id: 'mem-welcome',
    name: 'Welcome Aboard',
    description: 'Activate Member Portal',
    category: 'membership',
    rarity: 'common',
    requirement: 0,
    icon: '🎉',
  },
  {
    id: 'mem-first-renewal',
    name: 'First Renewal',
    description: 'Renew membership once',
    category: 'membership',
    rarity: 'rare',
    requirement: 1,
    icon: '🔄',
  },
  {
    id: 'mem-committed',
    name: 'Committed Member',
    description: '3 renewals',
    category: 'membership',
    rarity: 'epic',
    requirement: 3,
    icon: '🤝',
  },
  {
    id: 'mem-loyalist',
    name: 'Gym Loyalist',
    description: '6 renewals',
    category: 'membership',
    rarity: 'legendary',
    requirement: 6,
    icon: '🏅',
  },
  {
    id: 'mem-one-year',
    name: 'One Year Strong',
    description: '1 year continuous membership',
    category: 'membership',
    rarity: 'mythic',
    requirement: 365,
    icon: '🎂',
  },

  // ─── XP ─────────────────────────────────────────────────────────────────────
  {
    id: 'xp-start',
    name: 'Getting Started',
    description: 'Earn 100 XP',
    category: 'xp',
    rarity: 'common',
    requirement: 100,
    icon: '⭐',
  },
  {
    id: 'xp-rising',
    name: 'Rising Strong',
    description: 'Earn 250 XP',
    category: 'xp',
    rarity: 'rare',
    requirement: 250,
    icon: '📈',
  },
  {
    id: 'xp-power',
    name: 'Power Player',
    description: 'Earn 1,000 XP',
    category: 'xp',
    rarity: 'epic',
    requirement: 1000,
    icon: '💥',
  },
  {
    id: 'xp-elite',
    name: 'Elite Member',
    description: 'Earn 2,500 XP',
    category: 'xp',
    rarity: 'legendary',
    requirement: 2500,
    icon: '🏆',
  },
  {
    id: 'xp-hall',
    name: 'Hall of Fame',
    description: 'Earn 10,000 XP',
    category: 'xp',
    rarity: 'mythic',
    requirement: 10000,
    icon: '🏛️',
  },

  // ─── Special ────────────────────────────────────────────────────────────────
  {
    id: 'spc-early-bird',
    name: 'Early Bird',
    description: '10 check-ins before 7:00 AM',
    category: 'special',
    rarity: 'rare',
    requirement: 10,
    icon: '🌅',
  },
  {
    id: 'spc-perfect-week',
    name: 'Perfect Week',
    description: 'Complete every scheduled workout in a week',
    category: 'special',
    rarity: 'epic',
    requirement: 1,
    icon: '🎯',
    pendingBackend: true,
  },
  {
    id: 'spc-challenge',
    name: 'Challenge Champion',
    description: 'Win a gym challenge',
    category: 'special',
    rarity: 'legendary',
    requirement: 1,
    icon: '🥇',
    pendingBackend: true,
  },
  {
    id: 'spc-unbreakable',
    name: 'Unbreakable',
    description: '180-day attendance streak',
    category: 'special',
    rarity: 'mythic',
    requirement: 180,
    icon: '🛡️',
  },
]
