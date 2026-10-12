/**
 * Gamification settings: validation, defaults and the snake_case <-> camelCase
 * mapping for the `gym_gamification_settings` table.
 *
 * Two directions, two levels of strictness:
 *  - WRITES go through `gamificationSettingsSchema` (strict; reject bad input).
 *  - READS go through `normalizeSettings` (lenient; a missing row or a field that
 *    fails validation falls back to its default, so one bad value written
 *    through PostgREST cannot blank the owner's settings page).
 */

import { z } from 'zod'
import {
  ACHIEVEMENT_CODE_PATTERN,
  DEFAULT_GAMIFICATION_SETTINGS,
  SETTINGS_LIMITS as L,
} from './constants'
import { isValidDateString } from './periods'
import type { GamificationSettings, XpMultiplier } from './types'

// ─── Wire shapes (snake_case, as stored) ─────────────────────────────────────

export interface XpMultiplierRow {
  label: string
  factor: number
  days_of_week: number[] | null
  start_date: string | null
  end_date: string | null
}

export interface GamificationSettingsRow {
  gym_id?: string
  leaderboards_enabled: boolean
  xp_per_checkin: number
  xp_per_renewal: number
  xp_portal_activation: number
  weekly_goal_days: number
  xp_multipliers: XpMultiplierRow[]
  badge_rules: Record<string, number>
  weekly_prize: string | null
  monthly_prize: string | null
  updated_at?: string
}

/** Columns to select for `normalizeSettings`. */
export const GAMIFICATION_SETTINGS_COLUMNS =
  'leaderboards_enabled, xp_per_checkin, xp_per_renewal, xp_portal_activation, weekly_goal_days, xp_multipliers, badge_rules, weekly_prize, monthly_prize'

// ─── Schemas (camelCase, what forms and server actions validate) ─────────────

const dateString = z.string().refine(isValidDateString, { message: 'Use a valid date (YYYY-MM-DD)' })

/** At most 2 decimals, so the integer-hundredths XP math is exact (see xp.ts). */
const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9

export const xpMultiplierSchema = z
  .object({
    label: z.string().trim().min(1, 'Give this bonus a name').max(L.multiplierLabelMax),
    factor: z
      .number()
      .min(L.multiplierFactor.min)
      .max(L.multiplierFactor.max)
      .refine(twoDecimals, { message: 'Use at most 2 decimal places' }),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Pick at least one day')
      .max(7)
      .refine(days => new Set(days).size === days.length, { message: 'Days must not repeat' })
      .nullable(),
    startDate: dateString.nullable(),
    endDate: dateString.nullable(),
  })
  .refine(m => m.startDate == null || m.endDate == null || m.startDate <= m.endDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  })

/** Empty / whitespace-only prize text is stored as NULL ("no prize"). */
const prize = z
  .string()
  .trim()
  .max(L.prizeMax)
  .nullable()
  .transform(v => (v ? v : null))

export const badgeRulesSchema = z
  .record(
    z.string().regex(ACHIEVEMENT_CODE_PATTERN, 'Invalid achievement code'),
    z.number().int().min(L.badgeThreshold.min).max(L.badgeThreshold.max),
  )
  .refine(rules => Object.keys(rules).length <= L.maxBadgeRules, {
    message: `At most ${L.maxBadgeRules} badge rules`,
  })

export const gamificationSettingsSchema = z.object({
  leaderboardsEnabled: z.boolean(),
  xpPerCheckin: z.number().int().min(L.xpPerCheckin.min).max(L.xpPerCheckin.max),
  xpPerRenewal: z.number().int().min(L.xpPerRenewal.min).max(L.xpPerRenewal.max),
  xpPortalActivation: z.number().int().min(L.xpPortalActivation.min).max(L.xpPortalActivation.max),
  weeklyGoalDays: z.number().int().min(L.weeklyGoalDays.min).max(L.weeklyGoalDays.max),
  xpMultipliers: z.array(xpMultiplierSchema).max(L.maxMultipliers),
  badgeRules: badgeRulesSchema,
  weeklyPrize: prize,
  monthlyPrize: prize,
})

/** For editors that save one card at a time. */
export const gamificationSettingsPatchSchema = gamificationSettingsSchema.partial()

export type GamificationSettingsInput = z.input<typeof gamificationSettingsSchema>
export type GamificationSettingsPatch = z.infer<typeof gamificationSettingsPatchSchema>

// ─── Mappers ─────────────────────────────────────────────────────────────────

export function multiplierFromRow(row: XpMultiplierRow): XpMultiplier {
  return {
    label: row.label,
    factor: row.factor,
    daysOfWeek: row.days_of_week ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
  }
}

export function multiplierToRow(multiplier: XpMultiplier): XpMultiplierRow {
  return {
    label: multiplier.label,
    factor: multiplier.factor,
    days_of_week: multiplier.daysOfWeek,
    start_date: multiplier.startDate,
    end_date: multiplier.endDate,
  }
}

/** Full settings -> row for an upsert. `gym_id` is added by the caller from a server-resolved gym. */
export function settingsToRow(
  settings: GamificationSettings,
): Omit<GamificationSettingsRow, 'gym_id' | 'updated_at'> {
  return {
    leaderboards_enabled: settings.leaderboardsEnabled,
    xp_per_checkin: settings.xpPerCheckin,
    xp_per_renewal: settings.xpPerRenewal,
    xp_portal_activation: settings.xpPortalActivation,
    weekly_goal_days: settings.weeklyGoalDays,
    xp_multipliers: settings.xpMultipliers.map(multiplierToRow),
    badge_rules: settings.badgeRules,
    weekly_prize: settings.weeklyPrize,
    monthly_prize: settings.monthlyPrize,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Row (or null/undefined when the gym has none) -> settings with defaults.
 * Never throws. Each field is validated on its own; invalid multipliers and
 * badge rules are dropped individually rather than discarding the whole list.
 */
export function normalizeSettings(row: unknown): GamificationSettings {
  const d = DEFAULT_GAMIFICATION_SETTINGS
  const fresh = (): GamificationSettings => ({ ...d, xpMultipliers: [], badgeRules: {} })
  if (!isRecord(row)) return fresh()

  const shape = gamificationSettingsSchema.shape
  const pick = <T>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
    const parsed = schema.safeParse(value)
    return parsed.success ? parsed.data : fallback
  }

  const xpMultipliers: XpMultiplier[] = []
  if (Array.isArray(row.xp_multipliers)) {
    for (const raw of row.xp_multipliers.slice(0, L.maxMultipliers)) {
      if (!isRecord(raw)) continue
      const parsed = xpMultiplierSchema.safeParse({
        label: raw.label,
        factor: raw.factor,
        daysOfWeek: raw.days_of_week ?? null,
        startDate: raw.start_date ?? null,
        endDate: raw.end_date ?? null,
      })
      if (parsed.success) xpMultipliers.push(parsed.data)
    }
  }

  const badgeRules: Record<string, number> = {}
  if (isRecord(row.badge_rules)) {
    const ruleValue = z.number().int().min(L.badgeThreshold.min).max(L.badgeThreshold.max)
    for (const [code, value] of Object.entries(row.badge_rules).slice(0, L.maxBadgeRules)) {
      if (ACHIEVEMENT_CODE_PATTERN.test(code) && ruleValue.safeParse(value).success) {
        badgeRules[code] = value as number
      }
    }
  }

  return {
    leaderboardsEnabled: pick(shape.leaderboardsEnabled, row.leaderboards_enabled, d.leaderboardsEnabled),
    xpPerCheckin: pick(shape.xpPerCheckin, row.xp_per_checkin, d.xpPerCheckin),
    xpPerRenewal: pick(shape.xpPerRenewal, row.xp_per_renewal, d.xpPerRenewal),
    xpPortalActivation: pick(shape.xpPortalActivation, row.xp_portal_activation, d.xpPortalActivation),
    weeklyGoalDays: pick(shape.weeklyGoalDays, row.weekly_goal_days, d.weeklyGoalDays),
    xpMultipliers,
    badgeRules,
    weeklyPrize: pick(shape.weeklyPrize, row.weekly_prize ?? null, d.weeklyPrize),
    monthlyPrize: pick(shape.monthlyPrize, row.monthly_prize ?? null, d.monthlyPrize),
  }
}

/**
 * The effective threshold for an achievement: the gym's override when it has
 * one, otherwise the built-in requirement from the achievement definition.
 */
export function badgeThreshold(
  rules: Record<string, number> | null | undefined,
  code: string,
  fallback: number,
): number {
  const override = rules?.[code]
  return typeof override === 'number' && Number.isFinite(override) && override > 0 ? override : fallback
}
