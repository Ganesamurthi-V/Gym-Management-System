/**
 * XP rules (lib/gamification/xp.ts): multiplier matching and the XP sum.
 * Mirrors the SQL function gamification_day_factor and the XP expression in
 * get_member_gamification / get_gym_leaderboard.
 */

import { describe, it, expect } from 'vitest'
import { checkinXp, computeXp, factorForDay, levelFromXp, multiplierMatches } from '@/lib/gamification/xp'
import { DEFAULT_GAMIFICATION_SETTINGS } from '@/lib/gamification/constants'
import type { XpMultiplier } from '@/lib/gamification/types'

const mult = (over: Partial<XpMultiplier> = {}): XpMultiplier => ({
  label: 'Bonus',
  factor: 2,
  daysOfWeek: null,
  startDate: null,
  endDate: null,
  ...over,
})

// 2026-10-11 is a Sunday, 2026-10-12 a Monday, 2026-10-17 a Saturday.
const SUNDAY = '2026-10-11'
const MONDAY = '2026-10-12'
const SATURDAY = '2026-10-17'

describe('multiplierMatches', () => {
  it('an unrestricted multiplier matches every day', () => {
    expect(multiplierMatches(mult(), MONDAY)).toBe(true)
  })

  it('days_of_week uses 0 = Sunday .. 6 = Saturday', () => {
    const weekend = mult({ daysOfWeek: [0, 6] })
    expect(multiplierMatches(weekend, SUNDAY)).toBe(true)
    expect(multiplierMatches(weekend, SATURDAY)).toBe(true)
    expect(multiplierMatches(weekend, MONDAY)).toBe(false)
  })

  it('an empty days_of_week matches no day', () => {
    expect(multiplierMatches(mult({ daysOfWeek: [] }), MONDAY)).toBe(false)
  })

  it('the date window is inclusive on both ends', () => {
    const festival = mult({ startDate: '2026-10-10', endDate: '2026-10-12' })
    expect(multiplierMatches(festival, '2026-10-09')).toBe(false)
    expect(multiplierMatches(festival, '2026-10-10')).toBe(true)
    expect(multiplierMatches(festival, '2026-10-12')).toBe(true)
    expect(multiplierMatches(festival, '2026-10-13')).toBe(false)
  })

  it('an open-ended window only bounds one side', () => {
    expect(multiplierMatches(mult({ startDate: '2026-10-12' }), '2030-01-01')).toBe(true)
    expect(multiplierMatches(mult({ startDate: '2026-10-12' }), '2026-10-11')).toBe(false)
    expect(multiplierMatches(mult({ endDate: '2026-10-12' }), '2020-01-01')).toBe(true)
    expect(multiplierMatches(mult({ endDate: '2026-10-12' }), '2026-10-13')).toBe(false)
  })

  it('day-of-week and date window must both hold', () => {
    const m = mult({ daysOfWeek: [1], startDate: '2026-10-01', endDate: '2026-10-31' })
    expect(multiplierMatches(m, MONDAY)).toBe(true)
    expect(multiplierMatches(m, SUNDAY)).toBe(false)       // in window, wrong day
    expect(multiplierMatches(m, '2026-11-02')).toBe(false) // a Monday, outside window
  })

  it('ignores a multiplier with a malformed date or factor', () => {
    expect(multiplierMatches(mult({ startDate: '2026-02-30' }), MONDAY)).toBe(false)
    expect(multiplierMatches(mult({ endDate: 'soon' }), MONDAY)).toBe(false)
    expect(multiplierMatches(mult({ factor: Number.NaN }), MONDAY)).toBe(false)
  })
})

describe('factorForDay', () => {
  it('is 1 when nothing matches', () => {
    expect(factorForDay([], MONDAY)).toBe(1)
    expect(factorForDay([mult({ daysOfWeek: [0] })], MONDAY)).toBe(1)
  })

  it('the highest matching factor wins; multipliers never stack', () => {
    const multipliers = [
      mult({ factor: 1.5 }),
      mult({ factor: 3, daysOfWeek: [1] }),
      mult({ factor: 5, daysOfWeek: [0] }), // does not match Monday
    ]
    expect(factorForDay(multipliers, MONDAY)).toBe(3)
    expect(factorForDay(multipliers, SUNDAY)).toBe(5)
    expect(factorForDay(multipliers, SATURDAY)).toBe(1.5)
  })

  it('clamps to 1..5 like the SQL', () => {
    expect(factorForDay([mult({ factor: 9 })], MONDAY)).toBe(5)
    expect(factorForDay([mult({ factor: 0.5 })], MONDAY)).toBe(1)
  })
})

describe('checkinXp', () => {
  const settings = { xpPerCheckin: 10, xpMultipliers: [] as XpMultiplier[] }

  it('awards once per distinct day', () => {
    expect(checkinXp([SUNDAY, MONDAY], settings)).toBe(20)
    expect(checkinXp([MONDAY, MONDAY], settings)).toBe(10)
    expect(checkinXp([], settings)).toBe(0)
  })

  it('applies the day\'s multiplier', () => {
    const s = { xpPerCheckin: 10, xpMultipliers: [mult({ factor: 2, daysOfWeek: [0] })] }
    expect(checkinXp([SUNDAY, MONDAY], s)).toBe(30) // 20 + 10
  })

  it('rounds the total, not each day', () => {
    // 3 days x 5 XP x 1.5 = 22.5 -> 23. Rounding per day would give 8 x 3 = 24.
    const s = { xpPerCheckin: 5, xpMultipliers: [mult({ factor: 1.5 })] }
    expect(checkinXp(['2026-10-10', SUNDAY, MONDAY], s)).toBe(23)
  })

  it('is exact for factors that are not representable in binary', () => {
    // 10 * 1.1 is 11.000000000000002 in floating point; 5 such days must be 55.
    const s = { xpPerCheckin: 10, xpMultipliers: [mult({ factor: 1.1 })] }
    const days = ['2026-10-08', '2026-10-09', '2026-10-10', SUNDAY, MONDAY]
    expect(checkinXp(days, s)).toBe(55)
  })

  it('is 0 when the owner sets check-in XP to 0', () => {
    expect(checkinXp([SUNDAY, MONDAY], { xpPerCheckin: 0, xpMultipliers: [mult({ factor: 5 })] })).toBe(0)
  })
})

describe('computeXp', () => {
  it('defaults reproduce the old hardcoded formula per day: 10 / 50 / 25', () => {
    const xp = computeXp({
      days: [SUNDAY, MONDAY, SATURDAY],
      memberships: 2,
      portalActivated: true,
      settings: DEFAULT_GAMIFICATION_SETTINGS,
    })
    expect(xp).toBe(3 * 10 + 2 * 50 + 25)
  })

  it('portal XP is only added once activated', () => {
    const base = { days: [], memberships: 0, settings: DEFAULT_GAMIFICATION_SETTINGS }
    expect(computeXp({ ...base, portalActivated: false })).toBe(0)
    expect(computeXp({ ...base, portalActivated: true })).toBe(25)
  })

  it('uses the gym\'s own values and multipliers', () => {
    const xp = computeXp({
      days: [SUNDAY, MONDAY],
      memberships: 3,
      portalActivated: true,
      settings: {
        xpPerCheckin: 20,
        xpPerRenewal: 100,
        xpPortalActivation: 0,
        xpMultipliers: [mult({ factor: 2, daysOfWeek: [0] })],
      },
    })
    expect(xp).toBe(40 + 20 + 300 + 0)
  })
})

describe('levelFromXp', () => {
  it('is one level per 300 XP, starting at level 1', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpInLevel: 0, xpForNextLevel: 300 })
    expect(levelFromXp(299)).toEqual({ level: 1, xpInLevel: 299, xpForNextLevel: 300 })
    expect(levelFromXp(300)).toEqual({ level: 2, xpInLevel: 0, xpForNextLevel: 300 })
    expect(levelFromXp(725)).toEqual({ level: 3, xpInLevel: 125, xpForNextLevel: 300 })
  })

  it('never goes below level 1', () => {
    expect(levelFromXp(-50).level).toBe(1)
  })
})
