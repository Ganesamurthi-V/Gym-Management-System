/**
 * XP rules. Pure, and an exact mirror of the SQL (`gamification_day_factor`
 * plus the XP sum in `get_member_gamification` / `get_gym_leaderboard`).
 *
 *   XP = round( sum over attended DAYS of xpPerCheckin * factor(day) )
 *      + xpPerRenewal * (number of membership rows)
 *      + xpPortalActivation (once, if the portal was activated)
 *
 * factor(day) is the HIGHEST factor among the multipliers that match the day,
 * or 1 when none matches. Multipliers never stack.
 */

import { SETTINGS_LIMITS, XP_PER_LEVEL } from './constants'
import { dayOfWeek, isValidDateString } from './periods'
import type { DateString, GamificationSettings, XpMultiplier } from './types'

type XpSettings = Pick<
  GamificationSettings,
  'xpPerCheckin' | 'xpPerRenewal' | 'xpPortalActivation' | 'xpMultipliers'
>

/**
 * The factor in hundredths (150 = 1.5x), rounded to 2 decimals and clamped to
 * 1..5 like the SQL. Integer hundredths keep the sum exact: 10 * 1.1 in floating
 * point is 11.000000000000002, which would make a .5 total round the wrong way.
 */
function factorHundredths(factor: number): number {
  const { min, max } = SETTINGS_LIMITS.multiplierFactor
  const rounded = Math.round(factor * 100)
  return Math.min(Math.max(rounded, min * 100), max * 100)
}

/**
 * Does this multiplier apply on this day?
 * (daysOfWeek is null OR contains the day's dow) AND (no startDate OR day >=
 * start) AND (no endDate OR day <= end). An empty daysOfWeek matches no day.
 * A multiplier with a malformed factor or date is ignored, like in SQL.
 */
export function multiplierMatches(multiplier: XpMultiplier, day: DateString): boolean {
  if (typeof multiplier.factor !== 'number' || !Number.isFinite(multiplier.factor)) return false

  if (Array.isArray(multiplier.daysOfWeek) && !multiplier.daysOfWeek.includes(dayOfWeek(day))) {
    return false
  }
  if (multiplier.startDate != null) {
    if (!isValidDateString(multiplier.startDate)) return false
    if (day < multiplier.startDate) return false
  }
  if (multiplier.endDate != null) {
    if (!isValidDateString(multiplier.endDate)) return false
    if (day > multiplier.endDate) return false
  }
  return true
}

/** Highest matching factor for the day, 1 when nothing matches. */
export function factorForDay(multipliers: readonly XpMultiplier[], day: DateString): number {
  return factorHundredthsForDay(multipliers, day) / 100
}

function factorHundredthsForDay(multipliers: readonly XpMultiplier[], day: DateString): number {
  let best = 100
  for (const m of multipliers) {
    if (!multiplierMatches(m, day)) continue
    const f = factorHundredths(m.factor)
    if (f > best) best = f
  }
  return best
}

/** XP from check-ins: one award per distinct attended day. */
export function checkinXp(
  days: readonly DateString[],
  settings: Pick<GamificationSettings, 'xpPerCheckin' | 'xpMultipliers'>,
): number {
  let hundredths = 0
  for (const day of new Set(days)) {
    hundredths += settings.xpPerCheckin * factorHundredthsForDay(settings.xpMultipliers, day)
  }
  // Round half up on integers, matching Postgres ROUND() for positive values.
  return Math.floor((hundredths + 50) / 100)
}

export function computeXp(input: {
  /** Attended days (see streak.ts `attendedDays`). Duplicates are ignored. */
  days: readonly DateString[]
  /** Number of membership rows: the first purchase counts too, as before. */
  memberships: number
  portalActivated: boolean
  settings: XpSettings
}): number {
  const { days, memberships, portalActivated, settings } = input
  return (
    checkinXp(days, settings) +
    settings.xpPerRenewal * Math.max(0, Math.floor(memberships)) +
    (portalActivated ? settings.xpPortalActivation : 0)
  )
}

export interface LevelInfo {
  /** 1-based. */
  level: number
  xpInLevel: number
  xpForNextLevel: number
}

export function levelFromXp(xp: number, xpPerLevel: number = XP_PER_LEVEL): LevelInfo {
  const safe = Math.max(0, Math.floor(xp))
  return {
    level: Math.floor(safe / xpPerLevel) + 1,
    xpInLevel: safe % xpPerLevel,
    xpForNextLevel: xpPerLevel,
  }
}
