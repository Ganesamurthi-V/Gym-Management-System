/**
 * Owner Gamification tab helpers (features/member-app/utils/gamificationConfig.ts):
 * form <-> settings mapping, validation edges, card summaries, prize period
 * labels, leader picking and the award row mapper.
 */

import { describe, it, expect } from 'vitest'
import {
  EDITABLE_BADGES,
  EMPTY_MULTIPLIER_FORM,
  achievementConfigToForm,
  awardDay,
  awardPeriodLabel,
  badgeRulesProblem,
  badgeRulesToForm,
  countBadgeOverrides,
  describeDays,
  describeMultiplier,
  describeWindow,
  findAward,
  findOverlappingAward,
  formatDay,
  formatPeriodLabel,
  mapAward,
  multiplierToForm,
  parseAchievementConfigForm,
  parseBadgeForm,
  parseMultiplierForm,
  parseXpBaseForm,
  patchToRow,
  pickLeaders,
  prizeFor,
  summarizeAchievementConfig,
  summarizeBadgeRules,
  summarizeXp,
  toggleWeekday,
  xpBaseToForm,
} from '@/features/member-app/utils/gamificationConfig'
import { DEFAULT_GAMIFICATION_SETTINGS, SETTINGS_LIMITS } from '@/lib/gamification/constants'
import { gamificationSettingsSchema } from '@/lib/gamification/settings'
import type { LeaderboardRow, XpMultiplier } from '@/lib/gamification/types'
import { ACHIEVEMENT_DEFINITIONS } from '@/lib/member/achievements/definitions'

const row = (over: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  memberId: 'm1',
  displayName: 'Akhil Prasad',
  rank: 1,
  value: 5,
  xp: 100,
  streak: 3,
  streakPending: false,
  daysLast7: 5,
  daysLast30: 12,
  isMe: false,
  totalMembers: 10,
  totalDays: 40,
  ...over,
})

describe('XP base form', () => {
  it('round-trips the saved values', () => {
    const form = xpBaseToForm(DEFAULT_GAMIFICATION_SETTINGS)
    expect(form).toEqual({ xpPerCheckin: '10', xpPerRenewal: '50', xpPortalActivation: '25' })
    expect(parseXpBaseForm(form)).toEqual({
      ok: true,
      value: { xpPerCheckin: 10, xpPerRenewal: 50, xpPortalActivation: 25 },
    })
  })

  it('accepts the bounds and rejects one past them', () => {
    const max = SETTINGS_LIMITS.xpPerCheckin.max
    expect(parseXpBaseForm({ xpPerCheckin: String(max), xpPerRenewal: '0', xpPortalActivation: '0' }).ok).toBe(true)
    const over = parseXpBaseForm({ xpPerCheckin: String(max + 1), xpPerRenewal: '0', xpPortalActivation: '0' })
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.errors.xpPerCheckin).toBe(`Enter a whole number from 0 to ${max}`)
  })

  it('treats an empty box as invalid, not as 0', () => {
    const parsed = parseXpBaseForm({ xpPerCheckin: '  ', xpPerRenewal: '50', xpPortalActivation: '25' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(Object.keys(parsed.errors)).toEqual(['xpPerCheckin'])
  })

  it('rejects decimals, negatives and text', () => {
    for (const bad of ['1.5', '-1', 'ten']) {
      expect(parseXpBaseForm({ xpPerCheckin: bad, xpPerRenewal: '50', xpPortalActivation: '25' }).ok).toBe(false)
    }
  })
})

describe('bonus rule form', () => {
  const monday: XpMultiplier = { label: 'Monday boost', factor: 2, daysOfWeek: [1], startDate: null, endDate: null }

  it('round-trips a rule through the form', () => {
    const diwali: XpMultiplier = {
      label: 'Diwali week',
      factor: 3,
      daysOfWeek: null,
      startDate: '2026-11-06',
      endDate: '2026-11-12',
    }
    for (const rule of [monday, diwali]) {
      expect(parseMultiplierForm(multiplierToForm(rule))).toEqual({ ok: true, value: rule })
    }
  })

  it('stores "no day selected" as null (every day), never as an empty list', () => {
    const parsed = parseMultiplierForm({ ...EMPTY_MULTIPLIER_FORM, label: 'Always' })
    expect(parsed).toEqual({
      ok: true,
      value: { label: 'Always', factor: 2, daysOfWeek: null, startDate: null, endDate: null },
    })
  })

  it('stores weekdays Monday-first whatever order they were tapped in', () => {
    const parsed = parseMultiplierForm({ ...EMPTY_MULTIPLIER_FORM, label: 'Weekend', days: [0, 6, 6] })
    expect(parsed.ok && parsed.value.daysOfWeek).toEqual([6, 0])
  })

  it('trims the name and requires one', () => {
    const ok = parseMultiplierForm({ ...EMPTY_MULTIPLIER_FORM, label: '  Boost  ' })
    expect(ok.ok && ok.value.label).toBe('Boost')
    const empty = parseMultiplierForm({ ...EMPTY_MULTIPLIER_FORM, label: '   ' })
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.errors.label).toBe('Give this bonus a name')
  })

  it('bounds the factor to 1..5 with at most 2 decimals', () => {
    const form = (factor: string) => ({ ...EMPTY_MULTIPLIER_FORM, label: 'x', factor })
    for (const good of ['1', '1.25', '5']) expect(parseMultiplierForm(form(good)).ok).toBe(true)
    for (const bad of ['0.5', '5.01', '1.234', '', 'abc']) {
      const parsed = parseMultiplierForm(form(bad))
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.errors.factor).toMatch(/^Enter a multiplier from 1 to 5/)
    }
  })

  it('rejects an end date before the start date, on the end field', () => {
    const parsed = parseMultiplierForm({
      ...EMPTY_MULTIPLIER_FORM,
      label: 'x',
      startDate: '2026-11-12',
      endDate: '2026-11-06',
    })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.errors.endDate).toBe('End date must be on or after the start date')
  })

  it('accepts a one-day window and an open-ended one', () => {
    const base = { ...EMPTY_MULTIPLIER_FORM, label: 'x' }
    expect(parseMultiplierForm({ ...base, startDate: '2026-11-06', endDate: '2026-11-06' }).ok).toBe(true)
    expect(parseMultiplierForm({ ...base, startDate: '2026-11-06' }).ok).toBe(true)
    expect(parseMultiplierForm({ ...base, endDate: '2026-11-06' }).ok).toBe(true)
  })

  it('rejects a date that is not a real calendar day', () => {
    const parsed = parseMultiplierForm({ ...EMPTY_MULTIPLIER_FORM, label: 'x', startDate: '2026-02-30' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.errors.startDate).toBeTruthy()
  })

  it('toggles weekday chips', () => {
    expect(toggleWeekday([], 1)).toEqual([1])
    expect(toggleWeekday([1], 0)).toEqual([1, 0])
    expect(toggleWeekday([1, 0], 1)).toEqual([0])
  })

  it('describes a rule in one line', () => {
    expect(describeMultiplier(monday)).toBe('×2 · Mon')
    expect(
      describeMultiplier({ label: 'd', factor: 1.5, daysOfWeek: null, startDate: '2026-11-06', endDate: '2026-11-12' }),
    ).toBe('×1.5 · Every day · 6 Nov 2026 to 12 Nov 2026')
    expect(describeDays([0, 6])).toBe('Sat, Sun')
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
    expect(describeWindow('2026-11-06', null)).toBe('From 6 Nov 2026')
    expect(describeWindow(null, '2026-11-06')).toBe('Until 6 Nov 2026')
    expect(describeWindow('2026-11-06', '2026-11-06')).toBe('6 Nov 2026')
    expect(describeWindow(null, null)).toBe('')
  })
})

describe('badge rules', () => {
  const king = EDITABLE_BADGES.find(b => b.code === 'att-consistency-king')!

  it('lists only real, numeric, non-trivial achievements', () => {
    const codes = EDITABLE_BADGES.map(b => b.code)
    expect(codes).toContain('att-consistency-king')
    expect(codes).toContain('str-7day')
    expect(codes).toContain('xp-hall')
    // Yes/no events and badges with no data behind them are not tunable.
    for (const excluded of ['att-welcome', 'mem-welcome', 'att-first-checkin', 'mem-first-renewal', 'wrk-first', 'spc-challenge']) {
      expect(codes).not.toContain(excluded)
    }
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.length).toBeLessThanOrEqual(SETTINGS_LIMITS.maxBadgeRules)
  })

  it('shows the default beside each badge and it matches the definition', () => {
    for (const badge of EDITABLE_BADGES) {
      const def = ACHIEVEMENT_DEFINITIONS.find(d => d.id === badge.code)!
      expect(badge.defaultThreshold).toBe(def.requirement)
      expect(badge.defaultThreshold).toBeGreaterThanOrEqual(badge.min)
      expect(badge.defaultThreshold).toBeLessThanOrEqual(badge.max)
      expect(badge.unit).not.toBe('')
    }
  })

  it('fills the form with the effective threshold', () => {
    const form = badgeRulesToForm({ [king.code]: 40 })
    expect(form[king.code]).toBe('40')
    expect(form['str-7day']).toBe('7')
  })

  it('stores only values that differ from the default', () => {
    const form = badgeRulesToForm({})
    expect(parseBadgeForm(form)).toEqual({ ok: true, value: {} })
    expect(parseBadgeForm({ ...form, [king.code]: '40' })).toEqual({ ok: true, value: { [king.code]: 40 } })
  })

  it('"reset to default" (default value or an empty box) removes the override', () => {
    const form = badgeRulesToForm({ [king.code]: 40 })
    expect(parseBadgeForm({ ...form, [king.code]: String(king.defaultThreshold) })).toEqual({ ok: true, value: {} })
    expect(parseBadgeForm({ ...form, [king.code]: '' })).toEqual({ ok: true, value: {} })
  })

  it('rejects out-of-range and non-integer thresholds per badge', () => {
    const form = badgeRulesToForm({})
    for (const bad of ['0', '-3', '2.5', 'abc', String(SETTINGS_LIMITS.badgeThreshold.max + 1)]) {
      const parsed = parseBadgeForm({ ...form, [king.code]: bad })
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(Object.keys(parsed.errors)).toEqual([king.code])
    }
  })

  it('caps the rolling-window badges at the length of their window', () => {
    const form = badgeRulesToForm({})
    expect(parseBadgeForm({ ...form, 'att-week-warrior': '7' }).ok).toBe(true)
    expect(parseBadgeForm({ ...form, 'att-week-warrior': '8' }).ok).toBe(false)
    expect(parseBadgeForm({ ...form, 'att-month-hustler': '30' }).ok).toBe(true)
    expect(parseBadgeForm({ ...form, 'att-month-hustler': '31' }).ok).toBe(false)
  })

  it('server check accepts what the form produces and rejects forged input', () => {
    expect(badgeRulesProblem({})).toBeNull()
    expect(badgeRulesProblem({ [king.code]: 40 })).toBeNull()
    expect(badgeRulesProblem({ 'att-week-warrior': 8 })).toMatch(/Week Warrior must be between 1 and 7/)
    expect(badgeRulesProblem({ 'att-first-checkin': 5 })).toBe('One of the badges cannot be customised.')
    expect(badgeRulesProblem({ 'not-a-badge': 5 })).toBe('One of the badges cannot be customised.')
    expect(badgeRulesProblem({ [king.code]: 0 })).toBe('One of the badge thresholds is not valid.')
    expect(badgeRulesProblem({ [king.code]: '40' })).toBe('One of the badge thresholds is not valid.')
    expect(badgeRulesProblem(null)).toBe('One of the badge thresholds is not valid.')
  })

  it('counts overrides, ignoring ones equal to the default or for unknown codes', () => {
    expect(countBadgeOverrides({})).toBe(0)
    expect(countBadgeOverrides({ [king.code]: 40, 'str-7day': 7, 'gone-badge': 3 })).toBe(1)
  })
})

describe('achievement config form', () => {
  it('round-trips, turning empty prize text into null', () => {
    const form = achievementConfigToForm(DEFAULT_GAMIFICATION_SETTINGS)
    expect(form).toEqual({ weeklyGoalDays: 4, weeklyPrize: '', monthlyPrize: '' })
    expect(parseAchievementConfigForm(form)).toEqual({
      ok: true,
      value: { weeklyGoalDays: 4, weeklyPrize: null, monthlyPrize: null },
    })
  })

  it('trims prize text and keeps whitespace-only as no prize', () => {
    const parsed = parseAchievementConfigForm({ weeklyGoalDays: 5, weeklyPrize: '  Free shake ', monthlyPrize: '   ' })
    expect(parsed).toEqual({
      ok: true,
      value: { weeklyGoalDays: 5, weeklyPrize: 'Free shake', monthlyPrize: null },
    })
  })

  it('limits prize length', () => {
    const atLimit = 'x'.repeat(SETTINGS_LIMITS.prizeMax)
    expect(parseAchievementConfigForm({ weeklyGoalDays: 4, weeklyPrize: atLimit, monthlyPrize: '' }).ok).toBe(true)
    const parsed = parseAchievementConfigForm({ weeklyGoalDays: 4, weeklyPrize: `${atLimit}x`, monthlyPrize: '' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.errors.weeklyPrize).toBe(`Keep the prize under ${SETTINGS_LIMITS.prizeMax} characters`)
  })

  it('keeps the weekly goal within 1..7', () => {
    for (const good of [1, 7]) {
      expect(parseAchievementConfigForm({ weeklyGoalDays: good, weeklyPrize: '', monthlyPrize: '' }).ok).toBe(true)
    }
    for (const bad of [0, 8, 2.5]) {
      expect(parseAchievementConfigForm({ weeklyGoalDays: bad, weeklyPrize: '', monthlyPrize: '' }).ok).toBe(false)
    }
  })
})

describe('card summaries', () => {
  it('summarises XP with the bonus rule count', () => {
    expect(summarizeXp(DEFAULT_GAMIFICATION_SETTINGS)).toBe('10 XP per check-in · 50 per renewal · no bonus rules')
    const rule: XpMultiplier = { label: 'a', factor: 2, daysOfWeek: null, startDate: null, endDate: null }
    expect(summarizeXp({ xpPerCheckin: 15, xpPerRenewal: 0, xpMultipliers: [rule] })).toBe(
      '15 XP per check-in · 0 per renewal · 1 bonus rule',
    )
    expect(summarizeXp({ xpPerCheckin: 15, xpPerRenewal: 0, xpMultipliers: [rule, rule] })).toMatch(/2 bonus rules$/)
  })

  it('summarises badge rules', () => {
    const total = EDITABLE_BADGES.length
    expect(summarizeBadgeRules({ badgeRules: {} })).toBe(`All ${total} badges use the default thresholds`)
    expect(summarizeBadgeRules({ badgeRules: { 'att-consistency-king': 40 } })).toBe(`1 of ${total} badges customised`)
  })

  it('summarises the goal and prizes', () => {
    const base = { weeklyGoalDays: 4, weeklyPrize: null, monthlyPrize: null }
    expect(summarizeAchievementConfig(base)).toBe('Weekly goal 4 days · no prizes set')
    expect(summarizeAchievementConfig({ ...base, weeklyGoalDays: 1, weeklyPrize: 'Shake' })).toBe(
      'Weekly goal 1 day · weekly prize set',
    )
    expect(summarizeAchievementConfig({ ...base, monthlyPrize: 'Month free' })).toMatch(/monthly prize set$/)
    expect(summarizeAchievementConfig({ ...base, weeklyPrize: 'a', monthlyPrize: 'b' })).toMatch(
      /weekly and monthly prizes set$/,
    )
  })

  it('never mentions a grace period or cutoff', () => {
    const text = [
      summarizeXp(DEFAULT_GAMIFICATION_SETTINGS),
      summarizeBadgeRules(DEFAULT_GAMIFICATION_SETTINGS),
      summarizeAchievementConfig(DEFAULT_GAMIFICATION_SETTINGS),
      ...EDITABLE_BADGES.map(b => `${b.name} ${b.unit}`),
    ].join(' ')
    expect(text).not.toMatch(/grace|cut-?off|5 ?(am|a\.m\.|hours)/i)
  })
})

describe('patchToRow', () => {
  it('maps only the fields present in the patch', () => {
    expect(patchToRow({ leaderboardsEnabled: false })).toEqual({ leaderboards_enabled: false })
    expect(patchToRow({ weeklyGoalDays: 5, weeklyPrize: null })).toEqual({ weekly_goal_days: 5, weekly_prize: null })
    expect(patchToRow({})).toEqual({})
  })

  it('ignores keys explicitly set to undefined', () => {
    expect(patchToRow({ xpPerCheckin: undefined, xpPerRenewal: 60 })).toEqual({ xp_per_renewal: 60 })
  })

  it('writes multipliers and badge rules in the stored (snake_case) shape', () => {
    expect(
      patchToRow({
        xpMultipliers: [{ label: 'Mon', factor: 2, daysOfWeek: [1], startDate: '2026-11-06', endDate: null }],
        badgeRules: { 'str-7day': 5 },
      }),
    ).toEqual({
      xp_multipliers: [{ label: 'Mon', factor: 2, days_of_week: [1], start_date: '2026-11-06', end_date: null }],
      badge_rules: { 'str-7day': 5 },
    })
  })

  it('covers every settings field', () => {
    const full = gamificationSettingsSchema.parse(DEFAULT_GAMIFICATION_SETTINGS)
    expect(Object.keys(patchToRow(full)).sort()).toEqual(
      [
        'badge_rules',
        'leaderboards_enabled',
        'monthly_prize',
        'weekly_goal_days',
        'weekly_prize',
        'xp_multipliers',
        'xp_per_checkin',
        'xp_per_renewal',
        'xp_portal_activation',
      ].sort(),
    )
  })
})

describe('prize periods', () => {
  // 12 Oct 2026, 18:00 IST.
  const evening = '2026-10-12T12:30:00Z'

  it('labels the rolling window ending today, inclusive on both ends', () => {
    expect(awardPeriodLabel('week', evening)).toBe('2026-10-06..2026-10-12')
    expect(awardPeriodLabel('month', evening)).toBe('2026-09-13..2026-10-12')
  })

  it('is stable through one day and moves on the next', () => {
    const morning = '2026-10-12T03:30:00Z' // 09:00 IST
    const lateNight = '2026-10-12T18:00:00Z' // 23:30 IST
    expect(awardPeriodLabel('week', morning)).toBe(awardPeriodLabel('week', lateNight))
    expect(awardPeriodLabel('week', '2026-10-13T12:30:00Z')).toBe('2026-10-07..2026-10-13')
  })

  it('formats a label for display and leaves unknown labels alone', () => {
    expect(formatPeriodLabel('2026-10-06..2026-10-12')).toBe('6 Oct to 12 Oct 2026')
    expect(formatPeriodLabel('2025-12-29..2026-01-04')).toBe('29 Dec 2025 to 4 Jan 2026')
    expect(formatPeriodLabel('Week 41')).toBe('Week 41')
    expect(formatPeriodLabel('2026-02-30..2026-03-01')).toBe('2026-02-30..2026-03-01')
  })

  it('formats days without shifting them', () => {
    expect(formatDay('2026-01-01')).toBe('1 Jan 2026')
    expect(formatDay('2026-12-31', false)).toBe('31 Dec')
    expect(formatDay('nonsense')).toBe('nonsense')
  })

  it('formats the IST day an award was marked, tolerating bad timestamps', () => {
    // 20:00 UTC on the 11th is 01:30 IST on the 12th.
    expect(awardDay('2026-10-11T20:00:00Z')).toBe('12 Oct')
    expect(awardDay('')).toBe('')
    expect(awardDay('not a date')).toBe('')
  })

  it('picks the configured prize for a board', () => {
    const settings = { weeklyPrize: 'Shake', monthlyPrize: null }
    expect(prizeFor(settings, 'week')).toBe('Shake')
    expect(prizeFor(settings, 'month')).toBeNull()
    expect(prizeFor({ weeklyPrize: '', monthlyPrize: null }, 'week')).toBeNull()
  })
})

describe('leaders and awards', () => {
  it('picks the member in first place', () => {
    const rows = [row(), row({ memberId: 'm2', rank: 2, value: 3 })]
    expect(pickLeaders(rows).map(r => r.memberId)).toEqual(['m1'])
  })

  it('returns every member tied for first, up to the cap', () => {
    const rows = ['a', 'b', 'c', 'd'].map(id => row({ memberId: id })).concat(row({ memberId: 'e', rank: 5 }))
    expect(pickLeaders(rows).map(r => r.memberId)).toEqual(['a', 'b', 'c'])
    expect(pickLeaders(rows, 10)).toHaveLength(4)
  })

  it('has no leader when nobody has checked in, or the row has no member id', () => {
    expect(pickLeaders([])).toEqual([])
    expect(pickLeaders([row({ value: 0 })])).toEqual([])
    expect(pickLeaders([row({ memberId: null })])).toEqual([])
  })

  const award = (over: Record<string, string> = {}) => ({
    id: 'a1',
    memberId: 'm1',
    board: 'week',
    periodLabel: '2026-10-06..2026-10-12',
    awardedAt: '2026-10-12T10:00:00Z',
    ...over,
  })

  it('matches an award on member, board and exact period', () => {
    const awards = [award()]
    expect(findAward(awards, 'week', 'm1', '2026-10-06..2026-10-12')?.id).toBe('a1')
    expect(findAward(awards, 'month', 'm1', '2026-10-06..2026-10-12')).toBeUndefined()
    expect(findAward(awards, 'week', 'm2', '2026-10-06..2026-10-12')).toBeUndefined()
    expect(findAward(awards, 'week', 'm1', '2026-10-07..2026-10-13')).toBeUndefined()
  })

  it('finds an earlier award whose window still overlaps the current one', () => {
    const awards = [award()]
    // Next day: the label moved on, but six of the seven days are the same.
    expect(findOverlappingAward(awards, 'week', 'm1', '2026-10-07..2026-10-13')?.id).toBe('a1')
    // Last shared day.
    expect(findOverlappingAward(awards, 'week', 'm1', '2026-10-12..2026-10-18')?.id).toBe('a1')
    // No shared day any more: a new prize is due.
    expect(findOverlappingAward(awards, 'week', 'm1', '2026-10-13..2026-10-19')).toBeUndefined()
    // The exact period is findAward's job, not this one's.
    expect(findOverlappingAward(awards, 'week', 'm1', '2026-10-06..2026-10-12')).toBeUndefined()
    expect(findOverlappingAward(awards, 'week', 'm2', '2026-10-07..2026-10-13')).toBeUndefined()
    expect(findOverlappingAward(awards, 'month', 'm1', '2026-10-07..2026-10-13')).toBeUndefined()
    expect(findOverlappingAward([award({ periodLabel: 'Week 41' })], 'week', 'm1', '2026-10-07..2026-10-13')).toBeUndefined()
  })

  it('maps an award row with the member embedded as an object or a one-element array', () => {
    const raw = {
      id: 'a1',
      member_id: 'm1',
      board: 'month',
      period_label: '2026-09-13..2026-10-12',
      prize: 'One month free',
      awarded_at: '2026-10-12T10:00:00Z',
      member: { name: 'Akhil Prasad' },
    }
    const expected = {
      id: 'a1',
      memberId: 'm1',
      memberName: 'Akhil Prasad',
      board: 'month',
      periodLabel: '2026-09-13..2026-10-12',
      prize: 'One month free',
      awardedAt: '2026-10-12T10:00:00Z',
    }
    expect(mapAward(raw)).toEqual(expected)
    expect(mapAward({ ...raw, member: [{ name: 'Akhil Prasad' }] })).toEqual(expected)
  })

  it('falls back to a neutral name and drops unusable rows', () => {
    const raw = { id: 'a1', member_id: 'm1', board: 'week', period_label: 'p', prize: 'x', awarded_at: 't' }
    expect(mapAward({ ...raw, member: null })?.memberName).toBe('Member')
    expect(mapAward({ ...raw, board: 'daily' })).toBeNull()
    expect(mapAward({ ...raw, id: 7 })).toBeNull()
    expect(mapAward(null)).toBeNull()
  })
})
