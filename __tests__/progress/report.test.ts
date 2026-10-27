import { describe, expect, it } from 'vitest'
import { bmi, bmiCategory, buildReport, daysSince, measurementsDue, waistHipRatio, weighInDue } from '@/lib/progress/report'
import { bodyProfileSchema } from '@/lib/progress/validate'
import type { BodyLog } from '@/types/progress'

const log = (id: string, loggedOn: string, o: Partial<BodyLog> = {}): BodyLog => ({
  id, loggedOn, weightKg: null, waistCm: null, chestCm: null, hipsCm: null, armCm: null, thighCm: null, ...o,
})

describe('bmi', () => {
  it('rounds to one decimal and uses Asian-Indian cut-offs', () => {
    expect(bmi(72, 170)).toBe(24.9)
    expect(bmiCategory(18.4)).toBe('Underweight')
    expect(bmiCategory(18.5)).toBe('Healthy')
    expect(bmiCategory(22.9)).toBe('Healthy')
    expect(bmiCategory(23)).toBe('Overweight')
    expect(bmiCategory(24.9)).toBe('Overweight')
    expect(bmiCategory(25)).toBe('Obese')
  })
  it('waist-hip ratio', () => expect(waistHipRatio(80, 100)).toBe(0.8))
})

describe('daysSince', () => {
  it('counts calendar days across month and year ends', () => {
    expect(daysSince('2026-10-01', '2026-10-29')).toBe(28)
    expect(daysSince('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysSince('2026-10-29', '2026-10-29')).toBe(0)
  })
})

describe('schedule', () => {
  const today = '2026-10-29'
  it('measurements due with no tape data, or 28+ days after the last', () => {
    expect(measurementsDue([], today)).toBe(true)
    expect(measurementsDue([log('a', '2026-10-28', { weightKg: 70 })], today)).toBe(true)
    expect(measurementsDue([log('a', '2026-10-02', { waistCm: 80 })], today)).toBe(false)
    expect(measurementsDue([log('a', '2026-10-01', { waistCm: 80 })], today)).toBe(true)
  })
  it('weigh-in due after 7 days', () => {
    expect(weighInDue([], today)).toBe(true)
    expect(weighInDue([log('a', '2026-10-23', { weightKg: 70 })], today)).toBe(false)
    expect(weighInDue([log('a', '2026-10-22', { weightKg: 70 })], today)).toBe(true)
    expect(weighInDue([log('a', '2026-10-28', { waistCm: 80 })], today)).toBe(true)
  })
})

describe('buildReport', () => {
  const logs = [
    log('3', '2026-10-29', { weightKg: 68, waistCm: 80 }),
    log('1', '2026-09-01', { weightKg: 72, waistCm: 86, hipsCm: 100, armCm: 30 }),
    log('2', '2026-10-01', { weightKg: 70 }),
  ]
  const row = (r: ReturnType<typeof buildReport>, k: string) => r.rows.find((x) => x.key === k)!

  it('uses oldest and newest log that has each metric', () => {
    const r = buildReport(logs, { heightCm: 170, goal: 'lose_fat', targetWeightKg: null, targetDate: null })
    expect(r.start).toBe('2026-09-01')
    expect(r.latest).toBe('2026-10-29')
    expect(row(r, 'weight')).toMatchObject({ start: 72, latest: 68, change: -4, tone: 'good' })
    expect(row(r, 'waist')).toMatchObject({ start: 86, latest: 80, change: -6, tone: 'good' })
    expect(row(r, 'bmi').start).toBe(24.9)
    expect(row(r, 'hips')).toMatchObject({ change: null, tone: 'neutral' })
    expect(row(r, 'arm').change).toBeNull()
  })
  it('goal decides tone', () => {
    expect(row(buildReport(logs, { heightCm: 170, goal: 'build_muscle', targetWeightKg: null, targetDate: null }), 'weight').tone).toBe('bad')
    expect(row(buildReport(logs, { heightCm: 170, goal: 'build_muscle', targetWeightKg: null, targetDate: null }), 'waist').tone).toBe('neutral')
    expect(row(buildReport(logs, { heightCm: 170, goal: 'stay_fit', targetWeightKg: null, targetDate: null }), 'weight').tone).toBe('neutral')
  })
  it('a change under 0.3 is never bad', () => {
    const tiny = [log('a', '2026-10-01', { weightKg: 70 }), log('b', '2026-10-08', { weightKg: 70.2 })]
    expect(row(buildReport(tiny, { heightCm: 170, goal: 'lose_fat', targetWeightKg: null, targetDate: null }), 'weight').tone).toBe('neutral')
  })
  it('works without a profile', () => {
    const r = buildReport(logs, null)
    expect(row(r, 'bmi').latest).toBeNull()
    expect(row(r, 'weight').tone).toBe('neutral')
  })
})

describe('bodyProfileSchema', () => {
  it('validates range and goal', () => {
    expect(bodyProfileSchema.parse({ height_cm: '172.5', goal: 'stay_fit' }).height_cm).toBe(172.5)
    expect(bodyProfileSchema.safeParse({ height_cm: 99, goal: 'stay_fit' }).success).toBe(false)
    expect(bodyProfileSchema.safeParse({ height_cm: 231, goal: 'stay_fit' }).success).toBe(false)
    expect(bodyProfileSchema.safeParse({ height_cm: 170, goal: 'x' }).success).toBe(false)
    expect(bodyProfileSchema.safeParse({ goal: 'stay_fit' }).success).toBe(false)
  })
})
