import { describe, expect, it } from 'vitest'
import { addDays, adviceFor, buildPlan, planMessage, targetDateValid, type PlanInput } from '@/lib/progress/plan'
import { bodyProfileSchema } from '@/lib/progress/validate'

const TODAY = '2026-10-28'
const base: PlanInput = {
  goal: 'lose_fat', heightCm: 170, startWeightKg: 80, startDate: '2026-10-28',
  currentWeightKg: 80, targetWeightKg: 72, targetDate: '2027-01-27', // 91 days = 13 weeks
}
const plan = (o: Partial<PlanInput>, today = TODAY) => buildPlan({ ...base, ...o }, today)!

describe('buildPlan verdicts', () => {
  it('safe pace for losing', () => {
    const p = plan({})
    expect(p.verdict).toBe('safe')
    expect(p.daysLeft).toBe(91)
    expect(p.weeksLeft).toBe(13)
    expect(p.totalChangeKg).toBe(8)
    expect(p.requiredKgPerWeek).toBe(0.6)
    expect(p.paceRange).toEqual({ min: 0.45, max: 0.9 })
    expect(planMessage(p, 'lose_fat')).toBe('That is 0.6 kg a week. A healthy pace.')
  })
  it('too fast suggests the earliest date at the max pace', () => {
    const p = plan({ targetWeightKg: 65, targetDate: '2026-12-09' }) // 15 kg in 6 weeks
    expect(p.verdict).toBe('too_fast')
    expect(p.suggestedDate).toBe(addDays(TODAY, Math.ceil((15 / 0.9) * 7)))
    expect(planMessage(p, 'lose_fat')).toContain('faster than the healthy 0.9 kg')
  })
  it('very slow has no suggested date', () => {
    const p = plan({ targetWeightKg: 79, targetDate: '2027-10-28' })
    expect(p.verdict).toBe('very_slow')
    expect(p.suggestedDate).toBeNull()
  })
  it('exactly the max pace is still safe', () => {
    expect(plan({ targetWeightKg: 71.9, targetDate: '2026-12-30' }).verdict).toBe('safe') // 8.1 kg in 9 weeks
  })
  it('gain uses 0.25 to 0.5', () => {
    const p = plan({ goal: 'gain_weight', targetWeightKg: 84, targetDate: '2027-01-27' }) // 4 kg / 13 wk = 0.31
    expect(p.verdict).toBe('safe')
    expect(p.paceRange).toEqual({ min: 0.25, max: 0.5 })
    expect(plan({ goal: 'build_muscle', targetWeightKg: 90, targetDate: '2026-12-09' }).verdict).toBe('too_fast')
  })
  it('wrong direction', () => {
    expect(plan({ targetWeightKg: 85 }).verdict).toBe('wrong_direction')
    expect(plan({ goal: 'gain_weight', targetWeightKg: 75 }).verdict).toBe('wrong_direction')
  })
  it('reached and passed', () => {
    expect(plan({ currentWeightKg: 71 }).verdict).toBe('reached')
    expect(plan({ targetDate: TODAY }).verdict).toBe('passed')
    const past = plan({ targetDate: '2026-10-01' })
    expect(past.verdict).toBe('passed')
    expect(past.requiredKgPerWeek).toBeNull()
    expect(past.daysLeft).toBeLessThan(0)
    expect(past.weeksLeft).toBe(0)
  })
  it('stay_fit has no plan', () => {
    expect(buildPlan({ ...base, goal: 'stay_fit' }, TODAY)).toBeNull()
  })
})

describe('buildPlan progress', () => {
  it('percent complete and expected weight', () => {
    const p = plan({ currentWeightKg: 76, startDate: '2026-08-28' }, TODAY) // start 60 days before, target in 91
    expect(p.percentComplete).toBe(50)
    expect(p.expectedWeightToday).toBe(76.8) // 80 - 8 * 61/152
  })
  it('track status uses a 0.5 kg tolerance', () => {
    const at = (w: number) => plan({ currentWeightKg: w, startDate: '2026-08-28' }).trackStatus
    expect(at(76.0)).toBe('ahead')
    expect(at(76.5)).toBe('on_track')
    expect(at(77.5)).toBe('behind')
    const gain = (w: number) =>
      plan({ goal: 'gain_weight', targetWeightKg: 88, currentWeightKg: w, startDate: '2026-08-28' }).trackStatus
    expect(gain(84)).toBe('ahead')
    expect(gain(82)).toBe('behind')
  })
  it('BMI warning only for lose_fat below 18.5', () => {
    expect(plan({ targetWeightKg: 52 }).bmiWarning).toBe(true) // 17.99 at 170 cm
    expect(plan({ targetWeightKg: 60 }).bmiWarning).toBe(false)
    expect(plan({ goal: 'gain_weight', targetWeightKg: 52, startWeightKg: 40, currentWeightKg: 40 }).bmiWarning).toBe(false)
  })
})

describe('adviceFor', () => {
  it('computes protein grams for the weight and gives 3 to 4 tips', () => {
    const tips = adviceFor('lose_fat', 60)
    expect(tips.length).toBeGreaterThanOrEqual(3)
    expect(tips.length).toBeLessThanOrEqual(4)
    expect(tips.join(' ')).toContain('84 to 120 g')
    for (const g of ['build_muscle', 'gain_weight', 'stay_fit'] as const) {
      const t = adviceFor(g, 60)
      expect(t.length).toBeGreaterThanOrEqual(3)
      expect(t.length).toBeLessThanOrEqual(4)
    }
  })
})

describe('targetDateValid and schema', () => {
  it('window is tomorrow to 730 days', () => {
    expect(targetDateValid(TODAY, TODAY)).toBe(false)
    expect(targetDateValid(addDays(TODAY, 1), TODAY)).toBe(true)
    expect(targetDateValid(addDays(TODAY, 730), TODAY)).toBe(true)
    expect(targetDateValid(addDays(TODAY, 731), TODAY)).toBe(false)
  })
  it('profile schema needs both target fields or neither', () => {
    const ok = { height_cm: 170, goal: 'lose_fat' }
    expect(bodyProfileSchema.safeParse(ok).success).toBe(true)
    expect(bodyProfileSchema.safeParse({ ...ok, target_weight_kg: '', target_date: '' }).success).toBe(true)
    expect(bodyProfileSchema.safeParse({ ...ok, target_weight_kg: 70, target_date: '2027-01-01' }).success).toBe(true)
    expect(bodyProfileSchema.safeParse({ ...ok, target_weight_kg: 70 }).success).toBe(false)
    expect(bodyProfileSchema.safeParse({ ...ok, target_date: '2027-01-01' }).success).toBe(false)
    expect(bodyProfileSchema.safeParse({ ...ok, target_weight_kg: 5, target_date: '2027-01-01' }).success).toBe(false)
  })
})
