/**
 * Gamification settings (lib/gamification/settings.ts): schema bounds for
 * writes, lenient normalisation for reads, and the row mappers.
 */

import { describe, it, expect } from 'vitest'
import {
  badgeThreshold,
  gamificationSettingsPatchSchema,
  gamificationSettingsSchema,
  multiplierFromRow,
  multiplierToRow,
  normalizeSettings,
  settingsToRow,
  xpMultiplierSchema,
} from '@/lib/gamification/settings'
import { DEFAULT_GAMIFICATION_SETTINGS } from '@/lib/gamification/constants'
import type { GamificationSettings } from '@/lib/gamification/types'

const valid = (over: Record<string, unknown> = {}) => ({
  ...DEFAULT_GAMIFICATION_SETTINGS,
  ...over,
})

const multiplier = (over: Record<string, unknown> = {}) => ({
  label: 'Weekend',
  factor: 2,
  daysOfWeek: [0, 6],
  startDate: null,
  endDate: null,
  ...over,
})

const accepts = (over: Record<string, unknown>) => gamificationSettingsSchema.safeParse(valid(over)).success

describe('gamificationSettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(gamificationSettingsSchema.safeParse(DEFAULT_GAMIFICATION_SETTINGS).success).toBe(true)
  })

  it('bounds xpPerCheckin to 0..100', () => {
    expect(accepts({ xpPerCheckin: 0 })).toBe(true)
    expect(accepts({ xpPerCheckin: 100 })).toBe(true)
    expect(accepts({ xpPerCheckin: -1 })).toBe(false)
    expect(accepts({ xpPerCheckin: 101 })).toBe(false)
    expect(accepts({ xpPerCheckin: 10.5 })).toBe(false)
  })

  it('bounds xpPerRenewal and xpPortalActivation to 0..500', () => {
    expect(accepts({ xpPerRenewal: 500, xpPortalActivation: 500 })).toBe(true)
    expect(accepts({ xpPerRenewal: 501 })).toBe(false)
    expect(accepts({ xpPortalActivation: 501 })).toBe(false)
    expect(accepts({ xpPerRenewal: -1 })).toBe(false)
  })

  it('bounds weeklyGoalDays to 1..7', () => {
    expect(accepts({ weeklyGoalDays: 1 })).toBe(true)
    expect(accepts({ weeklyGoalDays: 7 })).toBe(true)
    expect(accepts({ weeklyGoalDays: 0 })).toBe(false)
    expect(accepts({ weeklyGoalDays: 8 })).toBe(false)
  })

  it('caps the number of multipliers at 20', () => {
    expect(accepts({ xpMultipliers: Array.from({ length: 20 }, () => multiplier()) })).toBe(true)
    expect(accepts({ xpMultipliers: Array.from({ length: 21 }, () => multiplier()) })).toBe(false)
  })

  it('stores blank prize text as null and trims the rest', () => {
    const parsed = gamificationSettingsSchema.parse(valid({ weeklyPrize: '   ', monthlyPrize: '  Protein shaker ' }))
    expect(parsed.weeklyPrize).toBeNull()
    expect(parsed.monthlyPrize).toBe('Protein shaker')
  })

  it('rejects an over-long prize', () => {
    expect(accepts({ weeklyPrize: 'x'.repeat(120) })).toBe(true)
    expect(accepts({ weeklyPrize: 'x'.repeat(121) })).toBe(false)
  })

  it('the patch schema validates a single card without the other fields', () => {
    expect(gamificationSettingsPatchSchema.safeParse({ weeklyGoalDays: 5 }).success).toBe(true)
    expect(gamificationSettingsPatchSchema.safeParse({ weeklyGoalDays: 9 }).success).toBe(false)
    expect(gamificationSettingsPatchSchema.safeParse({}).success).toBe(true)
  })
})

describe('xpMultiplierSchema', () => {
  const ok = (over: Record<string, unknown>) => xpMultiplierSchema.safeParse(multiplier(over)).success

  it('bounds factor to 1..5 with at most 2 decimals', () => {
    expect(ok({ factor: 1 })).toBe(true)
    expect(ok({ factor: 5 })).toBe(true)
    expect(ok({ factor: 1.25 })).toBe(true)
    expect(ok({ factor: 1.1 })).toBe(true)
    expect(ok({ factor: 0.99 })).toBe(false)
    expect(ok({ factor: 5.01 })).toBe(false)
    expect(ok({ factor: 1.255 })).toBe(false)
  })

  it('days of week are 0..6, unique, and not an empty list', () => {
    expect(ok({ daysOfWeek: null })).toBe(true)
    expect(ok({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })).toBe(true)
    expect(ok({ daysOfWeek: [] })).toBe(false)
    expect(ok({ daysOfWeek: [7] })).toBe(false)
    expect(ok({ daysOfWeek: [-1] })).toBe(false)
    expect(ok({ daysOfWeek: [1, 1] })).toBe(false)
    expect(ok({ daysOfWeek: [1.5] })).toBe(false)
  })

  it('dates must be real YYYY-MM-DD dates', () => {
    expect(ok({ startDate: '2026-10-12', endDate: '2026-10-20' })).toBe(true)
    expect(ok({ startDate: '2026-02-30' })).toBe(false)
    expect(ok({ endDate: '12-10-2026' })).toBe(false)
  })

  it('end date may equal but not precede the start date', () => {
    expect(ok({ startDate: '2026-10-12', endDate: '2026-10-12' })).toBe(true)
    expect(ok({ startDate: '2026-10-12', endDate: '2026-10-11' })).toBe(false)
  })

  it('needs a non-blank label of at most 40 characters', () => {
    expect(ok({ label: '   ' })).toBe(false)
    expect(ok({ label: 'x'.repeat(40) })).toBe(true)
    expect(ok({ label: 'x'.repeat(41) })).toBe(false)
  })
})

describe('badgeRules bounds', () => {
  it('accepts thresholds 1..10000 keyed by achievement code', () => {
    expect(accepts({ badgeRules: { 'att-consistency-king': 50, 'streak-7': 1 } })).toBe(true)
    expect(accepts({ badgeRules: { 'att-century-club': 10000 } })).toBe(true)
  })

  it('rejects out-of-range or non-integer thresholds', () => {
    expect(accepts({ badgeRules: { 'att-consistency-king': 0 } })).toBe(false)
    expect(accepts({ badgeRules: { 'att-consistency-king': 10001 } })).toBe(false)
    expect(accepts({ badgeRules: { 'att-consistency-king': 2.5 } })).toBe(false)
  })

  it('rejects keys that are not achievement codes', () => {
    expect(accepts({ badgeRules: { 'Att Consistency': 50 } })).toBe(false)
    expect(accepts({ badgeRules: { ['a'.repeat(61)]: 50 } })).toBe(false)
  })

  it('caps the number of rules at 50', () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`code-${i}`, 5]))
    expect(accepts({ badgeRules: many(50) })).toBe(true)
    expect(accepts({ badgeRules: many(51) })).toBe(false)
  })
})

describe('normalizeSettings', () => {
  it('a missing row means the defaults', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_GAMIFICATION_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_GAMIFICATION_SETTINGS)
  })

  it('does not hand out the shared default arrays', () => {
    const a = normalizeSettings(null)
    a.xpMultipliers.push({ label: 'x', factor: 2, daysOfWeek: null, startDate: null, endDate: null })
    a.badgeRules['x'] = 1
    expect(DEFAULT_GAMIFICATION_SETTINGS.xpMultipliers).toEqual([])
    expect(DEFAULT_GAMIFICATION_SETTINGS.badgeRules).toEqual({})
  })

  it('maps a stored row to camelCase', () => {
    const settings = normalizeSettings({
      gym_id: 'g1',
      leaderboards_enabled: false,
      xp_per_checkin: 15,
      xp_per_renewal: 80,
      xp_portal_activation: 40,
      weekly_goal_days: 5,
      xp_multipliers: [
        { label: 'Weekend', factor: 2, days_of_week: [0, 6], start_date: null, end_date: null },
      ],
      badge_rules: { 'att-consistency-king': 40 },
      weekly_prize: 'Shaker',
      monthly_prize: null,
      updated_at: '2026-10-12T00:00:00Z',
    })
    expect(settings).toEqual({
      leaderboardsEnabled: false,
      xpPerCheckin: 15,
      xpPerRenewal: 80,
      xpPortalActivation: 40,
      weeklyGoalDays: 5,
      xpMultipliers: [{ label: 'Weekend', factor: 2, daysOfWeek: [0, 6], startDate: null, endDate: null }],
      badgeRules: { 'att-consistency-king': 40 },
      weeklyPrize: 'Shaker',
      monthlyPrize: null,
    } satisfies GamificationSettings)
  })

  it('falls back field by field instead of discarding the whole row', () => {
    const settings = normalizeSettings({
      leaderboards_enabled: false,
      xp_per_checkin: 9999,       // out of range -> default
      xp_per_renewal: 'lots',     // wrong type -> default
      weekly_goal_days: 6,
      xp_multipliers: 'nope',
      badge_rules: null,
    })
    expect(settings.leaderboardsEnabled).toBe(false)
    expect(settings.xpPerCheckin).toBe(10)
    expect(settings.xpPerRenewal).toBe(50)
    expect(settings.xpPortalActivation).toBe(25)
    expect(settings.weeklyGoalDays).toBe(6)
    expect(settings.xpMultipliers).toEqual([])
    expect(settings.badgeRules).toEqual({})
  })

  it('drops only the malformed multipliers and badge rules', () => {
    const settings = normalizeSettings({
      xp_multipliers: [
        { label: 'Good', factor: 1.5, days_of_week: null, start_date: null, end_date: null },
        { label: 'Bad factor', factor: 50 },
        { label: 'Bad date', factor: 2, start_date: '2026-02-30' },
        'junk',
        { label: 'Missing optionals', factor: 3 },
      ],
      badge_rules: { 'att-ok': 20, 'Bad Key': 5, 'att-zero': 0, 'att-text': 'ten' },
    })
    expect(settings.xpMultipliers.map(m => m.label)).toEqual(['Good', 'Missing optionals'])
    expect(settings.xpMultipliers[1]).toEqual({
      label: 'Missing optionals', factor: 3, daysOfWeek: null, startDate: null, endDate: null,
    })
    expect(settings.badgeRules).toEqual({ 'att-ok': 20 })
  })
})

describe('row mappers', () => {
  const settings: GamificationSettings = {
    leaderboardsEnabled: true,
    xpPerCheckin: 12,
    xpPerRenewal: 60,
    xpPortalActivation: 30,
    weeklyGoalDays: 3,
    xpMultipliers: [
      { label: 'Diwali week', factor: 2.5, daysOfWeek: null, startDate: '2026-11-06', endDate: '2026-11-12' },
    ],
    badgeRules: { 'att-century-club': 80 },
    weeklyPrize: 'Shaker',
    monthlyPrize: null,
  }

  it('settingsToRow produces the snake_case columns, without gym_id', () => {
    const row = settingsToRow(settings)
    expect(row).toEqual({
      leaderboards_enabled: true,
      xp_per_checkin: 12,
      xp_per_renewal: 60,
      xp_portal_activation: 30,
      weekly_goal_days: 3,
      xp_multipliers: [
        { label: 'Diwali week', factor: 2.5, days_of_week: null, start_date: '2026-11-06', end_date: '2026-11-12' },
      ],
      badge_rules: { 'att-century-club': 80 },
      weekly_prize: 'Shaker',
      monthly_prize: null,
    })
    // gym_id must come from a server-resolved gym, never from this mapper.
    expect(row).not.toHaveProperty('gym_id')
  })

  it('round-trips through the row shape', () => {
    expect(normalizeSettings(settingsToRow(settings))).toEqual(settings)
  })

  it('multiplier mappers are inverse', () => {
    const m = settings.xpMultipliers[0]
    expect(multiplierFromRow(multiplierToRow(m))).toEqual(m)
  })
})

describe('badgeThreshold', () => {
  it('uses the override when present, otherwise the built-in requirement', () => {
    expect(badgeThreshold({ 'att-consistency-king': 40 }, 'att-consistency-king', 50)).toBe(40)
    expect(badgeThreshold({}, 'att-consistency-king', 50)).toBe(50)
    expect(badgeThreshold(null, 'att-consistency-king', 50)).toBe(50)
  })
})
