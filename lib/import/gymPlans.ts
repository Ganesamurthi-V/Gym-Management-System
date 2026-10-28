/**
 * lib/import/gymPlans.ts
 * ──────────────────────
 * Links imported plan cells to the gym's OWN saved plans (the Plans page). Pure and shared:
 * the browser suggests with it, POST /api/import/confirm re-resolves every choice with the
 * server's copy of the plans, so nothing the browser sends about a plan's length is trusted.
 */
import { readSavedPlans, type PlanCategory } from '@/lib/plans/validate'
import { planForMonths, type ImportPlan } from '@/lib/import/membershipDates'
import { nameKey, recognizePlanMonths, sameName } from '@/lib/import/plan-matching'

export interface GymPlanChoice {
  planName: string
  category: PlanCategory
  months: number
  price: number
}

/** Plans saved on gyms.onboarding_data.plans, read with the Plans page's own parser. */
export function gymPlansFromOnboarding(onboardingData: unknown): GymPlanChoice[] {
  const raw = onboardingData && typeof onboardingData === 'object' && !Array.isArray(onboardingData)
    ? (onboardingData as Record<string, unknown>).plans
    : undefined
  return readSavedPlans(raw).plans.map(p => ({
    planName: p.planName,
    category: p.category,
    months: p.customDurationMonths ?? 1,
    price: p.price,
  }))
}

/** First plan with this name (case-insensitive); browser and server both use this, so they agree. */
export function findGymPlan(plans: GymPlanChoice[], name: string): GymPlanChoice | undefined {
  const n = name.trim().toLowerCase()
  return plans.find(p => p.planName.trim().toLowerCase() === n)
}

/** Select value for a gym plan; a plain "monthly" / "quarterly" / "annual" is a standard label. */
export const GYM_PREFIX = 'gym:'
export const gymChoiceValue = (name: string) => `${GYM_PREFIX}${name}`

/**
 * Suggested plan name for one sheet cell, or null when unsure (the owner must choose).
 * A name match wins ("gold plan" -> Gold); several same-named plans are told apart by a stated
 * length. With no name match, a stated length picks the gym plan of exactly that length, but
 * only when one plan has it: two candidates is a guess, so it stays unresolved.
 */
export function suggestGymPlan(raw: string, plans: GymPlanChoice[]): string | null {
  const months = recognizePlanMonths(raw)
  const key = nameKey(raw)
  const pickByMonths = (list: GymPlanChoice[]) => {
    const hit = months === null ? list : list.filter(p => Math.abs(p.months - months) < 1e-9)
    return hit.length === 1 || (hit.length > 1 && new Set(hit.map(p => p.planName.toLowerCase())).size === 1) ? hit[0] : null
  }
  const byName = key ? plans.filter(p => sameName(nameKey(p.planName), key)) : []
  if (byName.length > 0) return (pickByMonths(byName) ?? (new Set(byName.map(p => p.planName.toLowerCase())).size === 1 ? byName[0] : null))?.planName ?? null
  if (months !== null) return pickByMonths(plans)?.planName ?? null
  return null
}

/** Standard label to fall back on when a stated length matches none of the gym's plans. */
export function nearestStandard(raw: string): ImportPlan | null {
  const m = recognizePlanMonths(raw)
  return m === null ? null : planForMonths(m)
}

export interface PlanRow {
  plan: string
  category: string
  duration_months?: number
  plan_name?: string
}

/**
 * Applies the gym's saved plans to rows that name one. The plan's own length, label and
 * category replace whatever the browser sent. A name that is not one of THIS gym's plans fails
 * the whole request. Rows without plan_name are left to the existing built-in rules.
 */
export function applyGymPlans<T extends PlanRow>(
  rows: T[],
  plans: GymPlanChoice[],
): { ok: true; rows: T[] } | { ok: false; index: number } {
  const out: T[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.plan_name === undefined) { out.push(r); continue }
    const p = findGymPlan(plans, r.plan_name)
    if (!p) return { ok: false, index: i }
    const label = planForMonths(p.months)
    out.push({ ...r, plan: label, category: p.category, duration_months: p.months, plan_name: p.planName })
  }
  return { ok: true, rows: out }
}
