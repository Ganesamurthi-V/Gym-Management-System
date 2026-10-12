/**
 * Permanent achievements + gym threshold overrides
 * (lib/member/achievements/merge.ts and the evaluator's `badgeRules` argument).
 */

import { describe, it, expect } from 'vitest'
import {
  applyBadgeRule,
  mapRecordedAchievements,
  mergeRecordedAchievements,
  unlockedCodes,
} from '@/lib/member/achievements/merge'
import { evaluateAchievements } from '@/lib/member/achievements/evaluator'
import type { Achievement, MemberStats } from '@/lib/member/achievements/types'

function achievement(id: string, unlocked: boolean, extra: Partial<Achievement> = {}): Achievement {
  return {
    id,
    name: id,
    description: '',
    category: 'streak',
    rarity: 'common',
    requirement: 3,
    icon: '',
    unlocked,
    ...extra,
  }
}

const stats: MemberStats = {
  totalCheckins: 45,
  currentStreak: 0,
  weeklyCheckins: 2,
  monthlyCheckins: 8,
  renewalCount: 1,
  membershipStartDate: new Date().toISOString(),
  totalXP: 0,
  portalActivated: false,
}

describe('mergeRecordedAchievements', () => {
  it('keeps a recorded badge unlocked after the stats no longer meet it', () => {
    // The streak was 7 last week and is 0 today: the evaluator says "locked".
    const evaluated = [achievement('str-7day', false, { progress: 0 })]
    const merged = mergeRecordedAchievements(evaluated, [
      { code: 'str-7day', earnedAt: '2026-10-01T04:30:00Z', isNew: false },
    ])
    expect(merged[0].unlocked).toBe(true)
    expect(merged[0].unlockedAt).toBe('2026-10-01T04:30:00Z')
    expect(merged[0].isNew).toBe(false)
    // Progress is untouched; the card decides what to show for an unlocked badge.
    expect(merged[0].progress).toBe(0)
  })

  it('flags a badge recorded by this call as new', () => {
    const merged = mergeRecordedAchievements(
      [achievement('str-3day', true)],
      [{ code: 'str-3day', earnedAt: '2026-10-12T04:30:00Z', isNew: true }],
    )
    expect(merged[0]).toMatchObject({ unlocked: true, isNew: true, unlockedAt: '2026-10-12T04:30:00Z' })
  })

  it('keeps a met badge unlocked when recording failed (no rows came back)', () => {
    const merged = mergeRecordedAchievements([achievement('str-3day', true)], [])
    expect(merged[0].unlocked).toBe(true)
    expect(merged[0].unlockedAt).toBeUndefined()
    expect(merged[0].isNew).toBeUndefined()
  })

  it('leaves a badge that is neither met nor recorded locked', () => {
    const merged = mergeRecordedAchievements([achievement('str-30day', false)], [
      { code: 'str-3day', earnedAt: '2026-10-01T04:30:00Z', isNew: false },
    ])
    expect(merged[0].unlocked).toBe(false)
  })

  it('ignores recorded codes that have no definition, and preserves order', () => {
    const evaluated = [achievement('a', false), achievement('b', true), achievement('c', false)]
    const merged = mergeRecordedAchievements(evaluated, [
      { code: 'retired-badge', earnedAt: '2026-01-01T00:00:00Z', isNew: false },
      { code: 'c', earnedAt: null, isNew: false },
    ])
    expect(merged.map(a => a.id)).toEqual(['a', 'b', 'c'])
    expect(merged.map(a => a.unlocked)).toEqual([false, true, true])
  })

  it('does not mutate its input', () => {
    const evaluated = [achievement('a', false)]
    mergeRecordedAchievements(evaluated, [{ code: 'a', earnedAt: null, isNew: true }])
    expect(evaluated[0].unlocked).toBe(false)
  })
})

describe('unlockedCodes', () => {
  it('lists only what is met right now', () => {
    expect(unlockedCodes([achievement('a', true), achievement('b', false), achievement('c', true)])).toEqual(['a', 'c'])
  })
})

describe('mapRecordedAchievements', () => {
  it('maps RPC rows', () => {
    expect(
      mapRecordedAchievements([{ code: 'str-3day', earned_at: '2026-10-12T04:30:00Z', is_new: true }]),
    ).toEqual([{ code: 'str-3day', earnedAt: '2026-10-12T04:30:00Z', isNew: true }])
  })

  it('returns [] for null (RPC error) and drops malformed rows', () => {
    expect(mapRecordedAchievements(null)).toEqual([])
    expect(mapRecordedAchievements('nope')).toEqual([])
    expect(mapRecordedAchievements([null, {}, { code: '' }, { code: 7 }, { code: 'ok' }])).toEqual([
      { code: 'ok', earnedAt: null, isNew: false },
    ])
  })
})

describe('applyBadgeRule', () => {
  const def = { id: 'att-consistency-king', requirement: 50, description: '50 total check-ins' }

  it('returns the definition unchanged without an override', () => {
    expect(applyBadgeRule(def, {})).toBe(def)
    expect(applyBadgeRule(def, null)).toBe(def)
    expect(applyBadgeRule(def, { 'other-badge': 10 })).toBe(def)
  })

  it('overrides the threshold and keeps the description truthful', () => {
    expect(applyBadgeRule(def, { 'att-consistency-king': 40 })).toEqual({
      id: 'att-consistency-king',
      requirement: 40,
      description: '40 total check-ins',
    })
  })

  it('rewrites grouped numbers and does not touch other digits', () => {
    expect(
      applyBadgeRule({ id: 'xp-power', requirement: 1000, description: 'Earn 1,000 XP' }, { 'xp-power': 1500 })
        .description,
    ).toBe('Earn 1,500 XP')
    expect(
      applyBadgeRule(
        { id: 'spc-early-bird', requirement: 10, description: '10 check-ins before 7:00 AM' },
        { 'spc-early-bird': 7 },
      ).description,
    ).toBe('7 check-ins before 7:00 AM')
    // 100 must not be found inside "1,100".
    expect(
      applyBadgeRule({ id: 'x', requirement: 100, description: 'Beat 1,100 then 100' }, { x: 5 }).description,
    ).toBe('Beat 1,100 then 5')
  })

  it('leaves the text alone when the number is not written in it', () => {
    const year = { id: 'mem-one-year', requirement: 365, description: '1 year continuous membership' }
    expect(applyBadgeRule(year, { 'mem-one-year': 300 })).toEqual({ ...year, requirement: 300 })
  })

  it('does not override yes/no badges or accept a non-positive threshold', () => {
    const first = { id: 'att-first-checkin', requirement: 1, description: '1 check-in' }
    expect(applyBadgeRule(first, { 'att-first-checkin': 5 })).toBe(first)
    expect(applyBadgeRule(def, { 'att-consistency-king': 0 })).toBe(def)
    expect(applyBadgeRule(def, { 'att-consistency-king': -4 })).toBe(def)
  })
})

describe('evaluateAchievements with badge rules', () => {
  const find = (list: Achievement[], id: string) => list.find(a => a.id === id)!

  it('uses the built-in threshold by default', () => {
    const king = find(evaluateAchievements(stats), 'att-consistency-king')
    expect(king).toMatchObject({ unlocked: false, requirement: 50, progress: 45 })
  })

  it('unlocks at the gym override', () => {
    const king = find(evaluateAchievements(stats, { 'att-consistency-king': 40 }), 'att-consistency-king')
    expect(king).toMatchObject({ unlocked: true, requirement: 40, description: '40 total check-ins' })
  })

  it('a missed day re-locks the live evaluation but not the merged result', () => {
    const live = evaluateAchievements({ ...stats, currentStreak: 0 })
    expect(find(live, 'str-3day').unlocked).toBe(false)

    const merged = mergeRecordedAchievements(live, [
      { code: 'str-3day', earnedAt: '2026-09-20T04:30:00Z', isNew: false },
    ])
    expect(find(merged, 'str-3day').unlocked).toBe(true)
    expect(unlockedCodes(live)).not.toContain('str-3day')
  })
})
