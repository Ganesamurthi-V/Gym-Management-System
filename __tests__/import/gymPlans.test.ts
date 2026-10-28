import { describe, it, expect } from 'vitest'
import { applyGymPlans, findGymPlan, gymPlansFromOnboarding, suggestGymPlan, nearestStandard } from '@/lib/import/gymPlans'
import { importConfirmSchema } from '@/lib/import/schema'
import { resolveImportedMembership, monthsForPlan } from '@/lib/import/membershipDates'

const saved = [
  { planName: 'Gold', category: 'both', duration: 'custom', customDurationMonths: 6, price: 6000 },
  { planName: 'Silver', category: 'strength', duration: 'quarterly', price: 3000 },
  { planName: 'Basic Monthly', category: 'cardio', duration: 'monthly', price: 1000 },
  { planName: 'Elite', category: 'both', duration: 'custom', customDurationMonths: 18, price: 15000 },
  { planName: 'Broken' }, // unreadable entry is skipped, not fatal
]
const plans = gymPlansFromOnboarding({ plans: saved })
const row = (over: Record<string, unknown> = {}) => ({ name: 'A', start_date: '2026-01-01', ...over })

describe('gymPlansFromOnboarding', () => {
  it('reads the Plans page format with month lengths', () => {
    expect(plans.map(p => [p.planName, p.months])).toEqual([['Gold', 6], ['Silver', 3], ['Basic Monthly', 1], ['Elite', 18]])
  })
  it('gives an empty list when the gym has no plans', () => {
    expect(gymPlansFromOnboarding(null)).toEqual([])
    expect(gymPlansFromOnboarding({})).toEqual([])
    expect(gymPlansFromOnboarding({ plans: 'x' })).toEqual([])
  })
})

describe('suggestGymPlan', () => {
  it('matches names loosely', () => {
    expect(suggestGymPlan('gold plan', plans)).toBe('Gold')
    expect(suggestGymPlan('SILVER', plans)).toBe('Silver')
  })
  it('matches a stated length to the one plan of that length', () => {
    expect(suggestGymPlan('6 months', plans)).toBe('Gold')
    expect(suggestGymPlan('Quarterly', plans)).toBe('Silver')
  })
  it('leaves unknown names and ambiguous lengths unresolved', () => {
    expect(suggestGymPlan('Zumba', plans)).toBeNull()
    const twin = [...plans, { planName: 'Gold Lite', category: 'both' as const, months: 6, price: 1 }]
    expect(suggestGymPlan('6 months', twin)).toBeNull()
  })
  it('falls back to a standard label for a length no plan has', () => {
    expect(suggestGymPlan('2 months', plans)).toBeNull()
    expect(nearestStandard('2 months')).toBe('quarterly')
    expect(nearestStandard('Zumba')).toBeNull()
  })
})

describe('applyGymPlans (server side)', () => {
  it('takes label, category and exact length from the gym plan and ignores the client', () => {
    const r = applyGymPlans([row({ plan_name: 'gold', plan: 'annual', category: 'cardio', duration_months: 24 })] as never[], plans)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const x = r.rows[0] as Record<string, unknown>
    expect(x).toMatchObject({ plan: 'quarterly', category: 'both', duration_months: 6, plan_name: 'Gold' })
    const end = resolveImportedMembership({ startDate: '2026-01-01', durationMonths: monthsForPlan('quarterly', 6), today: '2026-02-01' })
    expect(end.endDate).toBe('2026-07-01')
  })
  it('labels a 18 month plan annual and keeps 18 months', () => {
    const r = applyGymPlans([{ plan: 'monthly', category: 'both', plan_name: 'Elite' }], plans)
    expect(r.ok && r.rows[0]).toMatchObject({ plan: 'annual', duration_months: 18 })
  })
  it('refuses a plan that belongs to another gym or does not exist', () => {
    const other = gymPlansFromOnboarding({ plans: [{ planName: 'Platinum', duration: 'annual', price: 1 }] })
    expect(applyGymPlans([{ plan: 'monthly', category: 'both' }, { plan: 'monthly', category: 'both', plan_name: 'Platinum' }], plans)).toEqual({ ok: false, index: 1 })
    expect(findGymPlan(other, 'Platinum')).toBeDefined()
    expect(findGymPlan(plans, 'Platinum')).toBeUndefined()
  })
  it('leaves rows without plan_name on the built-in rules, and works with no saved plans', () => {
    const r = applyGymPlans([{ plan: 'annual', category: 'both', duration_months: 18 }], [])
    expect(r).toEqual({ ok: true, rows: [{ plan: 'annual', category: 'both', duration_months: 18 }] })
    expect(applyGymPlans([{ plan: 'monthly', category: 'both', plan_name: 'Gold' }], [])).toEqual({ ok: false, index: 0 })
  })
})

describe('importConfirmSchema plan_name', () => {
  it('accepts a plan_name, trims it, and caps its length', () => {
    const ok = importConfirmSchema.safeParse({ rows: [row({ plan_name: '  Gold ' })] })
    expect(ok.success && ok.data.rows[0].plan_name).toBe('Gold')
    expect(importConfirmSchema.safeParse({ rows: [row({ plan_name: 'x'.repeat(61) })] }).success).toBe(false)
    expect(importConfirmSchema.safeParse({ rows: [row({ plan_name: '' })] }).success && true).toBe(true)
  })
})
