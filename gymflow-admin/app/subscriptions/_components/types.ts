export interface SubscriptionRequest {
  id: string
  status: string
  submitted_at: string
  reviewed_at: string | null
  transaction_id: string | null
  notes: string | null
  rejection_reason: string | null
  uploaded_file_url: string | null
  plan_requested: 'monthly' | 'yearly' | 'whatsapp_addon' | null
  expected_amount_inr: number | null
  signedUrl: string | null
  gym_id: string
  gyms: { id: string; name: string; owner_id: string; subscription_status: string; plan_type: string } | null
}

export type Filter = 'all' | 'pending' | 'approved' | 'rejected'
export type PlanType = 'monthly' | 'yearly' | 'lifetime' | 'whatsapp_addon'

// Pre-selected plan comes from the stored plan_requested. Legacy rows (NULL) fall back to the
// owner's "Intended Plan:" note, mapping only monthly/yearly: an add-on is never inferred from
// free text, because the server rejects it unless the stored request says so.
export function defaultPlan(req: SubscriptionRequest): PlanType {
  if (req.plan_requested) return req.plan_requested
  const m = /Intended Plan:\s*(monthly|yearly)/i.exec(req.notes ?? '')
  return m ? (m[1].toLowerCase() as PlanType) : 'monthly'
}

/*
  The SaaS plans an admin can approve a payment against. No prices here: they live in
  platform_settings and change, so the amount shown is each request's expected_amount_inr
  (set by the DB from the plan the owner asked for). The expiry math lives in the
  approve_plan_payment SQL function.
*/
export const PLAN_OPTIONS: { value: Exclude<PlanType, 'whatsapp_addon'>; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'lifetime', label: 'Lifetime' },
]
