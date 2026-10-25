/* The two billing tiers a gym owner can buy, matching the in-app subscription
   (platform_settings in the product DB). `price` stays a literal number because
   scripts/check-copy-sync reads it with a regex. `months` drives the maths below so
   the savings can never drift from the prices. There is no 3-month plan in the
   product, so none is offered here. */
export const PLANS = [
  { id: 'monthly', label: 'Monthly', price: 999, months: 1 },
  { id: 'yearly', label: 'Yearly', price: 9999, months: 12 },
] as const;

/* The free forever plan and the WhatsApp add-on are not billing terms, so they are not in
   PLANS. They mirror FREE_PLAN_MEMBER_LIMIT and WHATSAPP_ADDON_PRICE_INR in the app's
   lib/subscription-utils.ts. */
export const FREE_MEMBER_LIMIT = 50;
export const WHATSAPP_ADDON_PRICE = 299;

export type Plan =(typeof PLANS)[number];
export type PlanId = Plan['id'];

/** The 1-month price is the reference rate every saving is measured against. */
export const MONTHLY_RATE = PLANS[0].price;

export function perMonth(plan: Plan): number {
  return Math.round(plan.price / plan.months);
}

/** Whole-percent saving vs paying the monthly rate for the same span. 0 for monthly. */
export function savingPercent(plan: Plan): number {
  const atMonthlyRate = MONTHLY_RATE * plan.months;
  if (atMonthlyRate <= plan.price) return 0;
  return Math.round((1 - plan.price / atMonthlyRate) * 100);
}

export const formatINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;
