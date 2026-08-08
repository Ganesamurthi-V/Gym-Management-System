/**
 * Achievement Evaluation Service
 *
 * Given member stats and achievement definitions, populates `unlocked` and
 * `progress` fields. No React, no DB calls — pure function.
 */

import type { Achievement, MemberStats } from './types'
import { ACHIEVEMENT_DEFINITIONS } from './definitions'

type AchievementDef = Omit<Achievement, 'unlocked' | 'unlockedAt' | 'progress'>

/**
 * Evaluates all achievements against the member's current stats.
 *
 * Rules per category:
 * - attendance: compare totalCheckins (or weeklyCheckins/monthlyCheckins for specific ones)
 * - streak: compare currentStreak
 * - workout: compare totalWorkouts (skip if undefined)
 * - membership: compare renewalCount or days-since-membershipStartDate
 * - xp: compare totalXP
 * - special: only evaluate if the required data field is present
 *
 * Achievements with `pendingBackend: true` whose data is undefined are excluded.
 */
export function evaluateAchievements(stats: MemberStats): Achievement[] {
  const results: Achievement[] = []

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const result = evaluateOne(def, stats)
    if (result) results.push(result)
  }

  // Safety: verify no duplicates
  const ids = results.map(a => a.id)
  const unique = new Set(ids)
  if (ids.length !== unique.size) {
    console.error('[Achievements] Duplicate achievement IDs detected')
  }

  return results
}

function evaluateOne(def: AchievementDef, stats: MemberStats): Achievement | null {
  // Skip pendingBackend achievements if data is unavailable
  if (def.pendingBackend) {
    if (def.category === 'workout' && stats.totalWorkouts === undefined) return null
    if (def.id === 'spc-perfect-week') return null  // no workout schedule data
    if (def.id === 'spc-challenge') return null     // no challenge data
  }

  let progress: number | undefined
  let unlocked = false

  switch (def.category) {
    case 'attendance':
      ({ progress, unlocked } = evaluateAttendance(def, stats))
      break
    case 'streak':
      progress = stats.currentStreak
      unlocked = stats.currentStreak >= def.requirement
      break
    case 'workout':
      if (stats.totalWorkouts === undefined) return null
      progress = stats.totalWorkouts
      unlocked = stats.totalWorkouts >= def.requirement
      break
    case 'membership':
      ({ progress, unlocked } = evaluateMembership(def, stats))
      break
    case 'xp':
      progress = stats.totalXP
      unlocked = stats.totalXP >= def.requirement
      break
    case 'special':
      ({ progress, unlocked } = evaluateSpecial(def, stats))
      break
  }

  return {
    ...def,
    unlocked,
    progress,
    pendingBackend: def.pendingBackend,
  }
}

function evaluateAttendance(
  def: AchievementDef,
  stats: MemberStats,
): { progress: number; unlocked: boolean } {
  switch (def.id) {
    case 'att-welcome':
      return { progress: stats.portalActivated ? 1 : 0, unlocked: stats.portalActivated }
    case 'att-first-checkin':
      return { progress: Math.min(stats.totalCheckins, 1), unlocked: stats.totalCheckins >= 1 }
    case 'att-week-warrior':
      return { progress: stats.weeklyCheckins, unlocked: stats.weeklyCheckins >= def.requirement }
    case 'att-month-hustler':
      return { progress: stats.monthlyCheckins, unlocked: stats.monthlyCheckins >= def.requirement }
    default:
      // Total-based (consistency king, century club, iron veteran)
      return { progress: stats.totalCheckins, unlocked: stats.totalCheckins >= def.requirement }
  }
}

function evaluateMembership(
  def: AchievementDef,
  stats: MemberStats,
): { progress: number; unlocked: boolean } {
  switch (def.id) {
    case 'mem-welcome':
      return { progress: stats.portalActivated ? 1 : 0, unlocked: stats.portalActivated }
    case 'mem-one-year': {
      // Days since membership start
      if (!stats.membershipStartDate) return { progress: 0, unlocked: false }
      const startMs = new Date(stats.membershipStartDate).getTime()
      const days = Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24))
      return { progress: Math.max(0, days), unlocked: days >= def.requirement }
    }
    default:
      // Renewal count based (first-renewal, committed, loyalist)
      // renewalCount = total memberships - 1 (first purchase is not a renewal)
      const renewals = Math.max(0, stats.renewalCount - 1)
      return { progress: renewals, unlocked: renewals >= def.requirement }
  }
}

function evaluateSpecial(
  def: AchievementDef,
  stats: MemberStats,
): { progress: number | undefined; unlocked: boolean } {
  switch (def.id) {
    case 'spc-early-bird':
      if (stats.earlyMorningCheckins === undefined) return { progress: undefined, unlocked: false }
      return {
        progress: stats.earlyMorningCheckins,
        unlocked: stats.earlyMorningCheckins >= def.requirement,
      }
    case 'spc-unbreakable':
      return {
        progress: stats.currentStreak,
        unlocked: stats.currentStreak >= def.requirement,
      }
    default:
      return { progress: undefined, unlocked: false }
  }
}
