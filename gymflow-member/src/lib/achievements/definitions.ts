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
    name: 'Portal Initiate',           // badge: First_Spark — blue lightning bolt, "first spark of energy"
    description: 'Activated Member Portal',
    category: 'attendance',
    rarity: 'common',
    requirement: 0,
    icon: '👋',
  },
  {
    id: 'att-first-checkin',
    name: 'First Spark',               // badge: First_Spark — blue electric bolt, the very first jolt of activity
    description: '1 check-in',
    category: 'attendance',
    rarity: 'common',
    requirement: 1,
    icon: '✅',
  },
  {
    id: 'att-week-warrior',
    name: 'Blue Flame',                // badge: Week_Warrior — neon blue fire with sparkle stars
    description: '5 check-ins in one week',
    category: 'attendance',
    rarity: 'rare',
    requirement: 5,
    icon: '⚡',
  },
  {
    id: 'att-month-hustler',
    name: 'Calendar Crusher',          // badge: Month_Hustler — 3D calendar with a check mark
    description: '10 check-ins in one month',
    category: 'attendance',
    rarity: 'rare',
    requirement: 10,
    icon: '🔥',
  },
  {
    id: 'att-consistency-king',
    name: 'Star Shield',               // badge: consistency_king — purple hexagon with shield + star
    description: '50 total check-ins',
    category: 'attendance',
    rarity: 'epic',
    requirement: 50,
    icon: '👑',
  },
  {
    id: 'att-century-club',
    name: 'Golden Orbit',              // badge: century_club — gold hexagon with circular star medallion
    description: '100 total check-ins',
    category: 'attendance',
    rarity: 'legendary',
    requirement: 100,
    icon: '💯',
  },
  {
    id: 'att-iron-veteran',
    name: 'Crimson Centurion',         // badge: iron_veteran — hot-pink Spartan warrior helmet
    description: '250 total check-ins',
    category: 'attendance',
    rarity: 'mythic',
    requirement: 250,
    icon: '🏛️',
  },

  // ─── Streak ─────────────────────────────────────────────────────────────────
  {
    id: 'str-3day',
    name: 'Voltage Rush',              // badge: First_Spark (shared bolt visual) — blue lightning, first burst of streaking energy
    description: '3-day streak',
    category: 'streak',
    rarity: 'common',
    requirement: 3,
    icon: '⚡',
  },
  {
    id: 'str-7day',
    name: 'Inferno Protocol',          // badge: Week_Warrior — deep blue fire, intensity ramping up
    description: '7-day streak',
    category: 'streak',
    rarity: 'rare',
    requirement: 7,
    icon: '🔥',
  },
  {
    id: 'str-14day',
    name: 'Violet Surge',              // badge: 14_days_unstopable — vivid purple lightning bolt, raw power
    description: '14-day streak',
    category: 'streak',
    rarity: 'epic',
    requirement: 14,
    icon: '💪',
  },
  {
    id: 'str-30day',
    name: 'Wildfire',                  // badge: 30_days_beast — blazing orange/gold flame, unstoppable heat
    description: '30-day streak',
    category: 'streak',
    rarity: 'legendary',
    requirement: 30,
    icon: '🦁',
  },
  {
    id: 'str-90day',
    name: 'Crown of Ninety',           // badge: 90_days_legend — hot-pink hexagon with crown + "90"
    description: '90-day streak',
    category: 'streak',
    rarity: 'mythic',
    requirement: 90,
    icon: '🏆',
  },

  // ─── Workout (pendingBackend — no workout sessions table yet) ───────────────
  {
    id: 'wrk-first',
    name: 'Iron Touch',                // badge: perfect_week — orange dumbbell, very first iron lifted
    description: 'Complete 1 workout',
    category: 'workout',
    rarity: 'common',
    requirement: 1,
    icon: '🏋️',
    pendingBackend: true,
  },
  {
    id: 'wrk-warrior',
    name: 'Grind Ascendant',           // badge: Rising_Star — blue star with ascending arrows, rising through the grind
    description: 'Complete 25 workouts',
    category: 'workout',
    rarity: 'rare',
    requirement: 25,
    icon: '⚔️',
    pendingBackend: true,
  },
  {
    id: 'wrk-machine',
    name: 'Bullseye Protocol',         // badge: Goal_Chaser — blue dartboard dead-center, precision machine
    description: 'Complete 50 workouts',
    category: 'workout',
    rarity: 'epic',
    requirement: 50,
    icon: '🤖',
    pendingBackend: true,
  },
  {
    id: 'wrk-legend',
    name: 'Solaris',                   // badge: elite_member — brilliant gold star radiating light
    description: 'Complete 100 workouts',
    category: 'workout',
    rarity: 'legendary',
    requirement: 100,
    icon: '🌟',
    pendingBackend: true,
  },
  {
    id: 'wrk-250club',
    name: 'Eternal Iron',              // badge: Unbreakable — magenta infinity symbol, endless reps
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
    name: 'The Arrival',               // att-welcome shares the portal activation milestone
    description: 'Activate Member Portal',
    category: 'membership',
    rarity: 'common',
    requirement: 0,
    icon: '🎉',
  },
  {
    id: 'mem-first-renewal',
    name: 'Pack Bond',                 // badge: Team_Player — blue group silhouette with heart, showing you're in
    description: 'Renew membership once',
    category: 'membership',
    rarity: 'rare',
    requirement: 1,
    icon: '🔄',
  },
  {
    id: 'mem-committed',
    name: 'Twin Allegiance',           // badge: comitted_member — purple dual-person silhouette, side by side
    description: '3 renewals',
    category: 'membership',
    rarity: 'epic',
    requirement: 3,
    icon: '🤝',
  },
  {
    id: 'mem-loyalist',
    name: 'Crest of Honor',            // badge: gym_loyalist — golden shield-with-banner crest
    description: '6 renewals',
    category: 'membership',
    rarity: 'legendary',
    requirement: 6,
    icon: '🏅',
  },
  {
    id: 'mem-one-year',
    name: 'Day 365',                   // badge: one_year_strong — hot-pink calendar showing "88" (stylised year milestone)
    description: '1 year continuous membership',
    category: 'membership',
    rarity: 'mythic',
    requirement: 365,
    icon: '🎂',
  },

  // ─── XP ─────────────────────────────────────────────────────────────────────
  {
    id: 'xp-start',
    name: 'Spark Seeker',              // early XP milestone, echoes the lightning-bolt starter energy
    description: 'Earn 100 XP',
    category: 'xp',
    rarity: 'common',
    requirement: 100,
    icon: '⭐',
  },
  {
    id: 'xp-rising',
    name: 'Ascent Protocol',           // badge: Rising_Star — blue star + upward arrows, XP climbing fast
    description: 'Earn 250 XP',
    category: 'xp',
    rarity: 'rare',
    requirement: 250,
    icon: '📈',
  },
  {
    id: 'xp-power',
    name: 'Apex Voltage',              // badge: 14_days_unstopable (purple bolt) — surge of raw XP power
    description: 'Earn 1,000 XP',
    category: 'xp',
    rarity: 'epic',
    requirement: 1000,
    icon: '💥',
  },
  {
    id: 'xp-elite',
    name: 'Gold Standard',             // badge: elite_member — gleaming gold star, the definitive elite mark
    description: 'Earn 2,500 XP',
    category: 'xp',
    rarity: 'legendary',
    requirement: 2500,
    icon: '🏆',
  },
  {
    id: 'xp-hall',
    name: 'Luminary',                  // badge: hall_of_fame — deep magenta star outline, permanently etched
    description: 'Earn 10,000 XP',
    category: 'xp',
    rarity: 'mythic',
    requirement: 10000,
    icon: '🏛️',
  },

  // ─── Special ────────────────────────────────────────────────────────────────
  {
    id: 'spc-early-bird',
    name: 'Dawn Striker',              // "before 7 AM" = striking at dawn, energetic early-bird vibe
    description: '10 check-ins before 7:00 AM',
    category: 'special',
    rarity: 'rare',
    requirement: 10,
    icon: '🌅',
  },
  {
    id: 'spc-perfect-week',
    name: 'Iron Week',                 // badge: perfect_week — glowing orange dumbbell, every session nailed
    description: 'Complete every scheduled workout in a week',
    category: 'special',
    rarity: 'epic',
    requirement: 1,
    icon: '🎯',
    pendingBackend: true,
  },
  {
    id: 'spc-challenge',
    name: 'Conquest Cup',              // badge: challenge_champion — blazing orange trophy with star
    description: 'Win a gym challenge',
    category: 'special',
    rarity: 'legendary',
    requirement: 1,
    icon: '🥇',
    pendingBackend: true,
  },
  {
    id: 'spc-unbreakable',
    name: 'Infinity Forged',           // badge: Unbreakable — magenta infinity loop, 180-day streak that never breaks
    description: '180-day attendance streak',
    category: 'special',
    rarity: 'mythic',
    requirement: 180,
    icon: '🛡️',
  },
]