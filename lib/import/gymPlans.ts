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

/**
 * Plan with this name (case-insensitive); browser and server both use this, so they agree.
 * Names repeat across categories (a "Quarterly" under Strength, Cardio and Strength + Cardio),
 * so a category picks between them; without one, or with none matching, the first by name wins.
 */
export function findGymPlan(plans: GymPlanChoice[], name: string, category?: string): GymPlanChoice | undefined {
  const n = name.trim().toLowerCase()
  const same = plans.filter(p => p.planName.trim().toLowerCase() === n)
  return same.find(p => p.category === category) ?? same[0]
}

const CATEGORY_LABEL: Record<PlanCategory, string> = { strength: 'Strength', cardio: 'Cardio', both: 'Strength + Cardio' }
/** "Quarterly (Strength + Cardio)": how a plan is shown wherever its name alone would be ambiguous. */
export const gymPlanLabel = (p: Pick<GymPlanChoice, 'planName' | 'category'>) => `${p.planName} (${CATEGORY_LABEL[p.category]})`

/** Select value for a gym plan; a plain "monthly" / "quarterly" / "annual" is a standard label. */
export const GYM_PREFIX = 'gym:'
export const gymChoiceValue = (p: Pick<GymPlanChoice, 'planName' | 'category'>) => `${GYM_PREFIX}${p.category}:${p.planName}`

/** Reads a select value back to its plan. Also reads the older `gym:<name>` form kept in an open session. */
export function gymPlanFromChoice(plans: GymPlanChoice[], choice: string): GymPlanChoice | undefined {
  if (!choice.startsWith(GYM_PREFIX)) return undefined
  const rest = choice.slice(GYM_PREFIX.length)
  const i = rest.indexOf(':')
  const cat = i > 0 ? rest.slice(0, i) : ''
  if (cat === 'strength' || cat === 'cardio' || cat === 'both') return findGymPlan(plans, rest.slice(i + 1), cat)
  return findGymPlan(plans, rest)
}

/**
 * Suggested plan name for one sheet cell, or null when unsure (the owner must choose).
 * A name match wins ("gold plan" -> Gold); several same-named plans are told apart by a stated
 * length. With no name match, a stated length picks the gym plan of exactly that length, but
 * only when one plan has it: two candidates is a guess, so it stays unresolved.
 */
export function suggestGymPlan(raw: string, plans: GymPlanChoice[]): GymPlanChoice | null {
  const months = recognizePlanMonths(raw)
  const key = nameKey(raw)
  // Same name in another category is a different plan, so it never counts as "one plan".
  const id = (p: GymPlanChoice) => `${p.category}:${p.planName.toLowerCase()}`
  const one = (list: GymPlanChoice[]) => (list.length > 0 && new Set(list.map(id)).size === 1 ? list[0] : null)
  const pickByMonths = (list: GymPlanChoice[]) => {
    const hit = months === null ? list : list.filter(p => Math.abs(p.months - months) < 1e-9)
    return one(hit)
  }
  const byName = key ? plans.filter(p => sameName(nameKey(p.planName), key)) : []
  if (byName.length > 0) return pickByMonths(byName) ?? one(byName)
  if (months !== null) return pickByMonths(plans)
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
    const p = findGymPlan(plans, r.plan_name, r.category)
    if (!p) return { ok: false, index: i }
    const label = planForMonths(p.months)
    out.push({ ...r, plan: label, category: p.category, duration_months: p.months, plan_name: p.planName })
  }
  return { ok: true, rows: out }
}
