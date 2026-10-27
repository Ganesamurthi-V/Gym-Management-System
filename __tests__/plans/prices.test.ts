import { describe, it, expect } from 'vitest'
import { getPlanPrices } from '@/lib/plans/prices'

const p = (duration: 'monthly' | 'quarterly' | 'annual' | 'custom', price: number, joiningFee = 0) => ({ duration, price, joiningFee })

describe('getPlanPrices', () => {
  it('falls back to defaults when plans are missing', () => {
    expect(getPlanPrices([])).toEqual({
      monthly: 1500, quarterly: 4000, annual: 10000,
      joining_fee_monthly: 0, joining_fee_quarterly: 0, joining_fee_annual: 0,
    })
  })
  it('uses the first plan per duration across categories and ignores custom', () => {
    const r = getPlanPrices([p('custom', 1), p('monthly', 1000, 200), p('monthly', 9), p('annual', 8000, 500), p('quarterly', 2500)])
    expect(r).toEqual({
      monthly: 1000, quarterly: 2500, annual: 8000,
      joining_fee_monthly: 200, joining_fee_quarterly: 0, joining_fee_annual: 500,
    })
  })
})
