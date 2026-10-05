/**
 * Unit tests for lib/import/plan-matching.ts.
 *
 * A recognised duration is applied without asking the owner, and a merged name
 * gives every member in the group the same expiry, so the cases that must NOT
 * match matter as much as the ones that must.
 */

import { describe, it, expect } from 'vitest'
import { editDistance, groupPlanNames, recognizePlanDuration } from '@/lib/import/plan-matching'
import { isRecognizedPlan, normalizePlan } from '@/lib/import/normalizers'

const each = (plan: string | null, cells: string[]) =>
  cells.forEach(cell => expect(recognizePlanDuration(cell), cell).toBe(plan))

describe('recognizePlanDuration', () => {
  it('keeps every spelling the importer already accepted', () => {
    each('monthly', ['monthly', 'Month', '1 month', '1m', '30 days', '30day', 'one month', 'mo', 'mon', 'mthly', 'mth'])
    each('quarterly', ['Quarterly', 'quarter', '3 months', '3m', '90 days', 'three months', '3mo', 'qtrly', 'qtr', 'q'])
    each('quarterly', ['6 months', '6m', 'six months', 'half year', 'half-yearly', 'biannual', 'semiannual', '180 days'])
    each('annual', ['Annual', 'annually', 'yearly', 'year', '1 year', '12 months', '12m', '365 days', 'one year', '1yr', 'yr', 'yrs', 'twelve months', 'pa', 'per annum'])
  })

  it('reads misspelt duration words', () => {
    each('monthly', ['montly', 'monthy', 'Mounthly', 'mnthly', 'monthlly', 'Monhtly'])
    each('quarterly', ['quaterly', 'Quartely', 'quartly', 'quarterley', 'qaurterly'])
    each('annual', ['anual', 'Annualy', 'anually', 'Yealy', 'yearley', 'annaul'])
  })

  it('reads a number with a unit, however it is written', () => {
    each('monthly', ['1 Month', '1 mnth', '1 months', '4 weeks', '45 days', '1.5 months', 'Monthly (1 Month)'])
    each('quarterly', ['3 mnths', '3 Mths', '2 months', '90 Days', '6 mos', 'Quarterly (3 Months)'])
    each('annual', ['1 Yr', '1 Year', '2 years', '12 Mths', '365 Days', '18 months'])
  })

  it('ignores filler and reads the duration inside a longer name', () => {
    each('monthly', ['MONTHLY PLAN', 'Monthly Membership', 'Gold Monthly', 'Monthly - Cardio'])
    each('quarterly', ['Gold - 3 Months', '3 Months Package', 'Quarterly Plan'])
    each('annual', ['Annual Membership', 'Platinum 1 Year', 'p.a.'])
  })

  it('treats half-year wording as six months, not a year', () => {
    each('quarterly', ['half yearly', 'Half-Yearly', 'semi annual', 'bi-annual', 'Half Year Plan'])
  })

  it('adds up bonus-month offers', () => {
    each('annual', ['12+1 months', '12 + 2 Months'])
    each('quarterly', ['3+1 months'])
  })

  it('reads a bare number as months, or as days when it can only be days', () => {
    each('monthly', ['1', '30'])
    each('quarterly', ['3', '6', '90', '180'])
    each('annual', ['12', '365'])
  })

  it('leaves tier names for the owner', () => {
    each(null, ['Gold', 'gold', 'Silver', 'Platinum', 'Platinam', 'Premium', 'VIP', 'Basic', 'Basik', 'Student', 'Morning', 'Couple'])
  })

  it('does not guess when the cell is not a plan length', () => {
    each(null, ['', '   ', '2500', '27', 'Gold 3', 'Mon-Fri batch', 'weekly', '1 week', '15 days', '1 day', 'bi monthly'])
  })

  it('does not pick one when the cell states two lengths', () => {
    each(null, ['1 year 6 months', 'Yearly paid monthly', 'Monthly / Annual'])
  })

  it('does not mistake a nearby word for a duration', () => {
    each(null, ['Early', 'Nearly', 'Manual', 'Quartz', 'Yeast', 'Mentor'])
  })
})

describe('normalizePlan / isRecognizedPlan', () => {
  it('falls back to monthly for a name, and says it was not recognised', () => {
    expect(normalizePlan('Gold')).toBe('monthly')
    expect(isRecognizedPlan('Gold')).toBe(false)
  })

  it('does not prompt for an empty cell', () => {
    expect(isRecognizedPlan('')).toBe(true)
    expect(normalizePlan('')).toBe('monthly')
  })

  it('recognises a misspelt duration without prompting', () => {
    expect(isRecognizedPlan('quaterly')).toBe(true)
    expect(normalizePlan('quaterly')).toBe('quarterly')
  })
})

describe('editDistance', () => {
  it('counts a swap of neighbours as one edit', () => {
    expect(editDistance('silver', 'sliver')).toBe(1)
    expect(editDistance('platinum', 'platinam')).toBe(1)
    expect(editDistance('gold', 'gold')).toBe(0)
    expect(editDistance('senior', 'junior')).toBe(2)
  })
})

/** The groups as sets of spellings, so the assertions do not depend on order. */
const grouped = (counts: Record<string, number>) =>
  groupPlanNames(counts).map(group => group.variants.map(variant => variant.raw).sort())
const together = (counts: Record<string, number>, ...names: string[]) =>
  expect(grouped(counts), names.join(' + ')).toContainEqual([...names].sort())
const ones = (...names: string[]) => Object.fromEntries(names.map(name => [name, 1]))

describe('groupPlanNames', () => {
  it('groups the spellings from a real sheet', () => {
    const groups = groupPlanNames({ Basik: 1, Premium: 4, gold: 2, premium: 1, VIP: 3, BASIC: 5, platinum: 2, Platinam: 1, Silver: 6, Gold: 7 })
    expect(groups.map(group => [group.label, group.count, group.variants.map(variant => variant.raw)])).toEqual([
      ['Gold', 9, ['Gold', 'gold']],
      ['BASIC', 6, ['BASIC', 'Basik']],
      ['Silver', 6, ['Silver']],
      ['Premium', 5, ['Premium', 'premium']],
      ['platinum', 3, ['platinum', 'Platinam']],
      ['VIP', 3, ['VIP']],
    ])
  })

  it('ignores case, spacing, punctuation and the word "plan"', () => {
    together(ones('Gold', 'GOLD', ' gold ', 'Gold Plan', 'gold-membership'), 'Gold', 'GOLD', ' gold ', 'Gold Plan', 'gold-membership')
    together(ones('VIP', 'V.I.P', 'vip'), 'VIP', 'V.I.P', 'vip')
    together(ones('Gold Plus', 'GoldPlus', 'Gold+'), 'Gold Plus', 'GoldPlus', 'Gold+')
  })

  it('groups one-letter slips and swapped letters in longer names', () => {
    together(ones('Silver', 'Sliver'), 'Silver', 'Sliver')
    together(ones('Diamond', 'Daimond', 'Dimond'), 'Diamond', 'Daimond', 'Dimond')
    together(ones('Standard', 'Standerd'), 'Standard', 'Standerd')
    together(ones('Premium', 'Premum', 'Preimum'), 'Premium', 'Premum', 'Preimum')
    together(ones('Platinum', 'Pletinam'), 'Platinum', 'Pletinam')
    together(ones('Student', 'Students'), 'Student', 'Students')
  })

  it('keeps different names apart even when they are one or two letters apart', () => {
    const apart = (a: string, b: string) => expect(grouped(ones(a, b)), `${a} / ${b}`).toHaveLength(2)
    apart('VIP', 'VVIP')
    apart('Pro', 'Pre')
    apart('Plan A', 'Plan B')
    apart('Gold 1', 'Gold 2')
    apart('Gold', 'Gold Plus')
    apart('Gold', 'Bold')
    apart('Royal', 'Loyal')
    apart('Senior', 'Junior')
    apart('Weekdays', 'Weekends')
    apart('Morning', 'Evening')
    apart('Premium', 'Premier')
    apart('Gold', 'Silver')
  })

  it('does not chain two names together through a spelling that sits between them', () => {
    // "Premiur" is one edit from both, but Premium and Premier are two apart.
    const groups = grouped({ Premium: 5, Premier: 4, Premiur: 1 })
    expect(groups).toHaveLength(2)
    expect(groups).toContainEqual(['Premier'])
  })

  it('labels a group with its most common spelling', () => {
    expect(groupPlanNames({ Platinam: 1, Platinum: 9 })[0].label).toBe('Platinum')
    // On a tie the known tier name wins over the misspelling.
    expect(groupPlanNames({ Platinam: 1, platinum: 1 })[0].label).toBe('platinum')
  })

  it('counts rows, and returns nothing for an empty file', () => {
    expect(groupPlanNames({ Gold: 3, gold: 2 })[0].count).toBe(5)
    expect(groupPlanNames({})).toEqual([])
  })
})
