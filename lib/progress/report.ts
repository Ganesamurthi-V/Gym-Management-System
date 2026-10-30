/** Pure body-report logic: BMI, tape ratios, check-in schedule and start-vs-now rows. IST-safe, no Date-from-string. */
import { dayNumber } from '@/lib/progress/chart'
import type { BodyGoal, BodyLog, BodyProfile } from '@/types/progress'

const MEASURE_DAYS = 28
const WEIGH_DAYS = 7
/** A change smaller than this is never called good or bad. */
const NOISE = 0.3

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return r1(weightKg / (m * m))
}

/** Asian-Indian cut-offs. */
export function bmiCategory(value: number): 'Underweight' | 'Healthy' | 'Overweight' | 'Obese' {
  if (value < 18.5) return 'Underweight'
  if (value < 23) return 'Healthy'
  if (value < 25) return 'Overweight'
  return 'Obese'
}

export function waistHipRatio(waistCm: number, hipsCm: number): number {
  return r2(waistCm / hipsCm)
}

/** Whole days from isoDate to todayIST (both YYYY-MM-DD). */
export function daysSince(isoDate: string, todayIST: string): number {
  return dayNumber(todayIST) - dayNumber(isoDate)
}

const hasTape = (l: BodyLog) =>
  l.waistCm != null || l.hipsCm != null || l.chestCm != null || l.armCm != null || l.thighCm != null

const newest = (logs: BodyLog[], pick: (l: BodyLog) => unknown): BodyLog | undefined =>
  logs.filter((l) => pick(l) != null).sort((a, b) => b.loggedOn.localeCompare(a.loggedOn))[0]

const oldest = (logs: BodyLog[], pick: (l: BodyLog) => unknown): BodyLog | undefined =>
  logs.filter((l) => pick(l) != null).sort((a, b) => a.loggedOn.localeCompare(b.loggedOn))[0]

export function measurementsDue(logs: BodyLog[], today: string): boolean {
  const last = newest(logs, (l) => (hasTape(l) ? 1 : null))
  return !last || daysSince(last.loggedOn, today) >= MEASURE_DAYS
}

export function weighInDue(logs: BodyLog[], today: string): boolean {
  const last = newest(logs, (l) => l.weightKg)
  return !last || daysSince(last.loggedOn, today) >= WEIGH_DAYS
}

export type Tone = 'good' | 'bad' | 'neutral'
export type MetricKey = 'weight' | 'bmi' | 'waist' | 'hips' | 'chest' | 'arm' | 'thigh' | 'whr'

export interface ReportRow {
  key: MetricKey
  label: string
  unit: string
  start: number | null
  latest: number | null
  change: number | null
  tone: Tone
}

export interface BodyReport {
  start: string | null
  latest: string | null
  rows: ReportRow[]
}

/** Which direction is good for each goal; anything not listed is neutral. */
const GOOD_DIRECTION: Record<BodyGoal, Partial<Record<MetricKey, 1 | -1>>> = {
  lose_fat: { weight: -1, bmi: -1, waist: -1, whr: -1 },
  build_muscle: { weight: 1, arm: 1, chest: 1, thigh: 1 },
  gain_weight: { weight: 1, arm: 1, chest: 1, thigh: 1 },
  stay_fit: {},
}

function toneFor(goal: BodyGoal | undefined, key: MetricKey, change: number | null): Tone {
  if (change == null || !goal || Math.abs(change) < NOISE) return 'neutral'
  const dir = GOOD_DIRECTION[goal][key]
  if (!dir) return 'neutral'
  return Math.sign(change) === dir ? 'good' : 'bad'
}

interface Metric {
  key: MetricKey
  label: string
  unit: string
  value: (l: BodyLog) => number | null
}

export function buildReport(logs: BodyLog[], profile: BodyProfile | null): BodyReport {
  const h = profile?.heightCm
  const metrics: Metric[] = [
    { key: 'weight', label: 'Weight', unit: 'kg', value: (l) => l.weightKg },
    { key: 'bmi', label: 'BMI', unit: '', value: (l) => (l.weightKg != null && h ? bmi(l.weightKg, h) : null) },
    { key: 'waist', label: 'Waist', unit: 'cm', value: (l) => l.waistCm },
    { key: 'hips', label: 'Hips', unit: 'cm', value: (l) => l.hipsCm },
    { key: 'chest', label: 'Chest', unit: 'cm', value: (l) => l.chestCm },
    { key: 'arm', label: 'Upper arm', unit: 'cm', value: (l) => l.armCm },
    { key: 'thigh', label: 'Thigh', unit: 'cm', value: (l) => l.thighCm },
    {
      key: 'whr', label: 'Waist-hip ratio', unit: '',
      value: (l) => (l.waistCm != null && l.hipsCm != null ? waistHipRatio(l.waistCm, l.hipsCm) : null),
    },
  ]
  const sorted = [...logs].sort((a, b) => a.loggedOn.localeCompare(b.loggedOn))
  const rows = metrics.map((m): ReportRow => {
    const s = oldest(sorted, m.value)
    const e = newest(sorted, m.value)
    const start = s ? m.value(s) : null
    const latest = e ? m.value(e) : null
    const change = s && e && s.id !== e.id && start != null && latest != null ? r2(latest - start) : null
    return { key: m.key, label: m.label, unit: m.unit, start, latest, change, tone: toneFor(profile?.goal, m.key, change) }
  })
  return {
    start: sorted[0]?.loggedOn ?? null,
    latest: sorted[sorted.length - 1]?.loggedOn ?? null,
    rows,
  }
}
