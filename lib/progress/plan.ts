/**
 * Pure target-weight plan: is the target date realistic, how far along is the member, and plain advice.
 * IST-safe: dates are 'YYYY-MM-DD' strings handled as day numbers, never Date-from-string.
 * For tracking only, not medical advice.
 *
 * Sources (short names used below):
 *  - CDC: safe weight loss is about 1 to 2 lb a week (0.45 to 0.9 kg). Faster loss risks losing muscle, bone and water.
 *  - Muscle gain: beginners can add about 0.9 kg (2 lb) of muscle a month, roughly 0.2 kg a week; scale weight
 *    overstates early gains (water, glycogen).
 *  - Gain pace of 0.25 to 0.5 kg a week is a commonly cited guide, NOT confirmed by the research above.
 *  - ISSN 2017 position stand: people who train need about 1.4 to 2.0 g of protein per kg body weight a day.
 *  - WHO 2020 adult guidelines: 150 to 300 min moderate activity a week (or 75 to 150 vigorous) plus
 *    muscle-strengthening on 2 or more days a week, all major muscle groups.
 */
import { dayNumber, mediumDate } from '@/lib/progress/chart'
import { bmi } from '@/lib/progress/report'
import type { BodyGoal } from '@/types/progress'

/** The target date must be after today and at most this many days ahead (matches save_body_profile). */
export const TARGET_MAX_DAYS = 730
/** A weight within this many kg of the expected weight counts as on track. */
const TRACK_TOLERANCE_KG = 0.5
/** Below this BMI a lose_fat target gets a warning. */
const BMI_FLOOR = 18.5

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/** Healthy kg per week by goal. Lose: CDC. Gain / build: commonly cited guide (see header). */
export function paceFor(goal: BodyGoal): { min: number; max: number } | null {
  if (goal === 'lose_fat') return { min: 0.45, max: 0.9 }
  if (goal === 'build_muscle' || goal === 'gain_weight') return { min: 0.25, max: 0.5 }
  return null
}

export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10)
}

/** True when date is after today and within TARGET_MAX_DAYS. */
export function targetDateValid(date: string, today: string): boolean {
  const d = dayNumber(date) - dayNumber(today)
  return d >= 1 && d <= TARGET_MAX_DAYS
}

export type Verdict = 'reached' | 'safe' | 'too_fast' | 'very_slow' | 'wrong_direction' | 'passed'
export type TrackStatus = 'ahead' | 'on_track' | 'behind'

export interface PlanInput {
  goal: BodyGoal
  heightCm: number
  startWeightKg: number
  startDate: string
  currentWeightKg: number
  targetWeightKg: number
  targetDate: string
}

export interface Plan {
  weeksLeft: number
  daysLeft: number
  /** Kilograms still to go, always positive (0 once reached). */
  totalChangeKg: number
  /** Null when the date has passed. */
  requiredKgPerWeek: number | null
  paceRange: { min: number; max: number }
  verdict: Verdict
  /** Only when too_fast: earliest date at the healthy maximum pace from today. */
  suggestedDate: string | null
  percentComplete: number
  expectedWeightToday: number
  trackStatus: TrackStatus
  targetBmi: number
  bmiWarning: boolean
}

/**
 * Null for stay_fit (no pace, advice only).
 * Direction is judged against the START weight (a target on the wrong side of where the member began is
 * wrong_direction); "reached" is judged against the CURRENT weight.
 */
export function buildPlan(input: PlanInput, today: string): Plan | null {
  const { goal, heightCm, startWeightKg: start, currentWeightKg: current, targetWeightKg: target } = input
  const paceRange = paceFor(goal)
  if (!paceRange) return null

  const losing = goal === 'lose_fat'
  const sign = losing ? -1 : 1 // direction the weight should move
  const daysLeft = dayNumber(input.targetDate) - dayNumber(today)
  const remaining = Math.max(0, (target - current) * sign)
  const wrongSide = (target - start) * sign < 0
  const reached = (current - target) * sign >= 0

  const required = daysLeft > 0 ? remaining / (daysLeft / 7) : null
  const requiredR = required == null ? null : r2(required)

  let verdict: Verdict
  if (wrongSide) verdict = 'wrong_direction'
  else if (reached) verdict = 'reached'
  else if (requiredR == null) verdict = 'passed'
  else if (requiredR > paceRange.max) verdict = 'too_fast'
  else if (requiredR < paceRange.min) verdict = 'very_slow'
  else verdict = 'safe'

  const span = dayNumber(input.targetDate) - dayNumber(input.startDate)
  const elapsed = dayNumber(today) - dayNumber(input.startDate)
  const fraction = span <= 0 || elapsed >= span ? 1 : Math.max(0, elapsed / span)
  const expected = start + (target - start) * fraction

  const totalMove = (target - start) * sign
  const done = (current - start) * sign
  const percentComplete = totalMove <= 0 ? 100 : Math.round(Math.min(100, Math.max(0, (done / totalMove) * 100)))

  const diff = (current - expected) * sign // positive = further along than expected
  const trackStatus: TrackStatus = diff > TRACK_TOLERANCE_KG ? 'ahead' : diff < -TRACK_TOLERANCE_KG ? 'behind' : 'on_track'

  const targetBmi = bmi(target, heightCm)
  return {
    weeksLeft: r1(Math.max(0, daysLeft) / 7),
    daysLeft,
    totalChangeKg: r1(remaining),
    requiredKgPerWeek: requiredR == null ? null : r1(requiredR),
    paceRange,
    verdict,
    suggestedDate: verdict === 'too_fast' ? addDays(today, Math.ceil((remaining / paceRange.max) * 7)) : null,
    percentComplete,
    expectedWeightToday: r1(expected),
    trackStatus,
    targetBmi,
    bmiWarning: losing && targetBmi < BMI_FLOOR,
  }
}

export const BMI_WARNING_TEXT = 'This target is below the healthy range for your height. Please check with a doctor or trainer first.'
export const NOT_MEDICAL_TEXT = 'For tracking only, not medical advice.'

/** One line for the verdict, shared by the form preview and the goal card. */
export function planMessage(plan: Plan, goal: BodyGoal): string {
  const perWeek = plan.requiredKgPerWeek == null ? '' : `${plan.requiredKgPerWeek} kg a week`
  switch (plan.verdict) {
    case 'reached':
      return 'You have reached your target weight.'
    case 'passed':
      return 'This date has passed. Pick a new target date.'
    case 'wrong_direction':
      return goal === 'lose_fat'
        ? 'Your target is above your starting weight. Set a lower target to lose fat.'
        : 'Your target is below your starting weight. Set a higher target to gain weight.'
    case 'too_fast':
      return `That is ${perWeek}, faster than the healthy ${plan.paceRange.max} kg. Try ${mediumDate(plan.suggestedDate!)}.`
    case 'very_slow':
      return `That is ${perWeek}, a gentle pace. You can choose an earlier date if you like.`
    case 'safe':
      return `That is ${perWeek}. A healthy pace.`
  }
}

/** Amber for plans to rethink, emerald for good ones, neutral otherwise. */
export function verdictTone(v: Verdict): 'warn' | 'good' | 'neutral' {
  if (v === 'too_fast' || v === 'wrong_direction' || v === 'passed') return 'warn'
  if (v === 'safe' || v === 'reached') return 'good'
  return 'neutral'
}

/** 3 to 4 short tips for the goal. Protein grams are for the member's current weight. */
export function adviceFor(goal: BodyGoal, weightKg: number): string[] {
  const lo = Math.round(weightKg * 1.4)
  const hi = Math.round(weightKg * 2.0)
  const protein = `If you train, about ${lo} to ${hi} g of protein a day is a good range at ${r1(weightKg)} kg.`
  const activity = 'Aim for 150 to 300 minutes of moderate activity a week (or 75 to 150 vigorous).'
  const strength = 'Do strength work on 2 or more days a week, covering all major muscle groups.'
  const sleep = 'Regular, full nights of sleep help recovery.'

  if (goal === 'lose_fat') {
    return [
      'A safe pace is about 0.45 to 0.9 kg a week. Losing faster risks losing muscle, bone and water instead of fat.',
      protein,
      `${activity} ${strength}`,
      sleep,
    ]
  }
  if (goal === 'build_muscle' || goal === 'gain_weight') {
    return [
      'A healthy pace is about 0.25 to 0.5 kg a week. Early scale gains include water and glycogen, so real muscle gain is slower, around 0.9 kg a month for beginners.',
      protein,
      strength,
      sleep,
    ]
  }
  return [protein, activity, strength, sleep]
}
