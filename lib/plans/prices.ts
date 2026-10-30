import type { MembershipPlan } from './validate'

type PriceFields = Pick<MembershipPlan, 'duration' | 'price' | 'joiningFee'>

/** Derives the six gym_plan_prices numbers from a plans array (first plan per duration wins). */
export function getPlanPrices(plans: PriceFields[]) {
  const byDuration = (duration: MembershipPlan['duration']) => plans.find((plan) => plan.duration === duration)
  return {
    monthly: byDuration('monthly')?.price ?? 1500,
    quarterly: byDuration('quarterly')?.price ?? 4000,
    annual: byDuration('annual')?.price ?? 10000,
    joining_fee_monthly: byDuration('monthly')?.joiningFee ?? 0,
    joining_fee_quarterly: byDuration('quarterly')?.joiningFee ?? 0,
    joining_fee_annual: byDuration('annual')?.joiningFee ?? 0,
  }
}
