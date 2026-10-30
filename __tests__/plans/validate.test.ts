import { describe, it, expect } from 'vitest'
import { normalizePlans, readSavedPlans } from '@/lib/plans/validate'

const base = {
  planName: ' Gold ', category: 'both', duration: 'monthly', price: 1500, joiningFee: 0,
  hasDiscount: false, discountPercent: 0, hasFreezeOption: false,
}
const ok = (p: unknown) => normalizePlans([p])

describe('normalizePlans', () => {
  it('trims name and forces fixed months', () => {
    const r = ok(base)
    expect(r.success && r.data[0].planName).toBe('Gold')
    expect(r.success && r.data[0].customDurationMonths).toBe(1)
    const q = ok({ ...base, duration: 'quarterly', customDurationMonths: 7 })
    expect(q.success && q.data[0].customDurationMonths).toBe(3)
    const a = ok({ ...base, duration: 'annual' })
    expect(a.success && a.data[0].customDurationMonths).toBe(12)
  })
  it('enforces name, price and fee bounds', () => {
    expect(ok({ ...base, planName: '   ' }).success).toBe(false)
    expect(ok({ ...base, planName: 'x'.repeat(61) }).success).toBe(false)
    expect(ok({ ...base, price: -1 }).success).toBe(false)
    expect(ok({ ...base, price: 1_000_001 }).success).toBe(false)
    expect(ok({ ...base, price: 10.5 }).success).toBe(false)
    expect(ok({ ...base, price: 0 }).success).toBe(true)
    expect(ok({ ...base, joiningFee: 1_000_001 }).success).toBe(false)
  })
  it('requires custom months 1..24', () => {
    expect(ok({ ...base, duration: 'custom' }).success).toBe(false)
    expect(ok({ ...base, duration: 'custom', customDurationMonths: 0 }).success).toBe(false)
    expect(ok({ ...base, duration: 'custom', customDurationMonths: 25 }).success).toBe(false)
    const r = ok({ ...base, duration: 'custom', customDurationMonths: 6 })
    expect(r.success && r.data[0].customDurationMonths).toBe(6)
  })
  it('resets discount percent when discount is off and bounds it', () => {
    const r = ok({ ...base, discountPercent: 20 })
    expect(r.success && r.data[0].discountPercent).toBe(0)
    expect(ok({ ...base, hasDiscount: true, discountPercent: 101 }).success).toBe(false)
    const d = ok({ ...base, hasDiscount: true, discountPercent: 20 })
    expect(d.success && d.data[0].discountPercent).toBe(20)
  })
  it('allows duplicates and strips unknown keys', () => {
    const r = normalizePlans([{ ...base, junk: 1 }, { ...base, price: 2000 }])
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toHaveLength(2)
      expect('junk' in r.data[0]).toBe(false)
    }
  })
  it('caps at 30 plans', () => {
    expect(normalizePlans(Array(30).fill(base)).success).toBe(true)
    expect(normalizePlans(Array(31).fill(base)).success).toBe(false)
  })
})

describe('plans saved by older versions of the app', () => {
  // The add-plan modal on the add-member screen once saved plans without these fields.
  const legacy = { planName: 'Custom', category: 'strength', duration: 'monthly', price: 1500 }

  it('a plan with the optional fields missing or null reads with defaults and does not block saving', () => {
    const r = normalizePlans([legacy, { ...legacy, joiningFee: null, hasDiscount: null, discountPercent: null, hasFreezeOption: null }])
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data[0]).toMatchObject({ joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false, category: 'strength' })
      expect(r.data[1]).toMatchObject({ joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false })
    }
  })

  it('a missing category becomes "both"', () => {
    const r = normalizePlans([{ planName: 'Old', duration: 'annual', price: 9000 }])
    expect(r.success && r.data[0].category).toBe('both')
  })

  it('a missing price or name is still rejected', () => {
    expect(normalizePlans([{ planName: 'No price', duration: 'monthly' }]).success).toBe(false)
    expect(normalizePlans([{ duration: 'monthly', price: 100 }]).success).toBe(false)
  })

  it('readSavedPlans reads each plan on its own and counts the ones it cannot read', () => {
    const { plans, unreadable } = readSavedPlans([legacy, { planName: '', duration: 'monthly', price: 1 }, base, 'junk', null])
    expect(plans).toHaveLength(2)
    expect(unreadable).toBe(3)
    expect(plans[0].hasFreezeOption).toBe(false)
  })

  it('readSavedPlans handles a missing or non-array value', () => {
    expect(readSavedPlans(undefined)).toEqual({ plans: [], unreadable: 0 })
    expect(readSavedPlans({})).toEqual({ plans: [], unreadable: 0 })
  })
})
