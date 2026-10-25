/** Paid plans: trial actions would silently downgrade these gyms, so the UI hides them and the trial route refuses. */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return plan === 'monthly' || plan === 'quarterly' || plan === 'yearly' || plan === 'lifetime'
}
