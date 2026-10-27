import { z } from 'zod'

export type PlanCategory = 'strength' | 'cardio' | 'both'
export type PlanDuration = 'monthly' | 'quarterly' | 'annual' | 'custom'

export interface MembershipPlan {
  planName: string
  category: PlanCategory
  duration: PlanDuration
  price: number
  joiningFee: number
  hasDiscount: boolean
  discountPercent: number
  hasFreezeOption: boolean
  customDurationMonths?: number
}

export const MAX_PLANS = 30
const FIXED_MONTHS = { monthly: 1, quarterly: 3, annual: 12 } as const

const money = z.number().int().min(0).max(1_000_000)

const planSchema = z
  .object({
    planName: z.string().trim().min(1, 'Enter a plan name').max(60, 'Plan name can be at most 60 characters'),
    // Plans saved by older versions of the app (the add-plan modal on the add-member screen) can lack the
    // optional fields or hold null. Missing means the default, so one old plan never blocks saving the rest.
    category: z.enum(['strength', 'cardio', 'both']).nullish(),
    duration: z.enum(['monthly', 'quarterly', 'annual', 'custom']),
    price: money,
    joiningFee: money.nullish(),
    hasDiscount: z.boolean().nullish(),
    discountPercent: z.number().int().min(0).max(100).nullish(),
    hasFreezeOption: z.boolean().nullish(),
    customDurationMonths: z.number().int().min(1).max(24).optional(),
  })
  .superRefine((plan, ctx) => {
    if (plan.duration === 'custom' && plan.customDurationMonths === undefined) {
      ctx.addIssue({ code: 'custom', path: ['customDurationMonths'], message: 'Enter the length in months (1 to 24)' })
    }
  })
  .transform((plan): MembershipPlan => {
    const out: MembershipPlan = {
      planName: plan.planName,
      category: plan.category ?? 'both',
      duration: plan.duration,
      price: plan.price,
      joiningFee: plan.joiningFee ?? 0,
      hasDiscount: plan.hasDiscount ?? false,
      discountPercent: plan.hasDiscount ? (plan.discountPercent ?? 0) : 0,
      hasFreezeOption: plan.hasFreezeOption ?? false,
    }
    out.customDurationMonths =
      plan.duration === 'custom' ? plan.customDurationMonths : FIXED_MONTHS[plan.duration]
    return out
  })

/** Duplicates (same duration + category) are intentionally allowed: existing gyms already have them. */
export const plansSchema = z.array(planSchema).max(MAX_PLANS, `You can have at most ${MAX_PLANS} plans`)

export function normalizePlans(input: unknown) {
  return plansSchema.safeParse(input)
}

/**
 * Reads the plans already saved on a gym for display and editing. Each plan is read on its own, so one
 * unreadable entry (for example one with no name) does not hide the others. `unreadable` counts the entries
 * that could not be read, so the page can say so instead of silently dropping them on the next save.
 */
export function readSavedPlans(raw: unknown): { plans: MembershipPlan[]; unreadable: number } {
  if (!Array.isArray(raw)) return { plans: [], unreadable: 0 }
  const plans: MembershipPlan[] = []
  let unreadable = 0
  for (const item of raw) {
    const parsed = planSchema.safeParse(item)
    if (parsed.success) plans.push(parsed.data)
    else unreadable++
  }
  return { plans, unreadable }
}

/** Keys (duration + category [+ months]) that appear more than once, for the UI warning. */
export function duplicateKeys(plans: MembershipPlan[]): Set<string> {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const p of plans) {
    const k = planGroupKey(p)
    if (seen.has(k)) dup.add(k)
    seen.add(k)
  }
  return dup
}

export function planGroupKey(p: Pick<MembershipPlan, 'category' | 'duration' | 'customDurationMonths'>): string {
  return `${p.category}:${p.duration}${p.duration === 'custom' ? `:${p.customDurationMonths ?? ''}` : ''}`
}
