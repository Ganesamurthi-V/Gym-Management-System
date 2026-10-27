import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api/withAuth'
import { normalizePlans } from '@/lib/plans/validate'
import { getPlanPrices } from '@/lib/plans/prices'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const log = logger.child({ component: 'ACCOUNT_PLANS' })

/**
 * PUT /api/account/plans  { plans: MembershipPlan[] }
 * Replaces gyms.onboarding_data.plans and keeps gym_plan_prices (used by the Excel import) in sync.
 */
export const PUT = withAuth('ACCOUNT_PLANS_PUT', async (req: NextRequest, { supabase, gym }) => {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError(400, 'BAD_REQUEST', 'We could not read your plans. Refresh the page and try again.')
  }
  const input = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).plans : undefined)
  const parsed = normalizePlans(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(400, 'VALIDATION_ERROR', issue?.message ?? 'Some plan details are not valid.')
  }
  const plans = parsed.data

  // A read failure must not be treated as empty: that would wipe every other onboarding key.
  const { data: current, error: readError } = await supabase
    .from('gyms')
    .select('onboarding_data')
    .eq('id', gym.id)
    .single()
  if (readError || !current) {
    log.error('Could not load gym before saving plans', { code: readError?.code, error: readError?.message })
    return apiError(500, 'DATABASE_ERROR', 'We could not load your gym details. Please try again.')
  }
  const existing = (current.onboarding_data && typeof current.onboarding_data === 'object' && !Array.isArray(current.onboarding_data)
    ? current.onboarding_data
    : {}) as Record<string, unknown>

  const { error: saveError } = await supabase
    .from('gyms')
    .update({ onboarding_data: { ...existing, plans } })
    .eq('id', gym.id)
  if (saveError) {
    log.error('Could not save plans', { code: saveError.code, error: saveError.message })
    return apiError(500, 'DATABASE_ERROR', 'We could not save your plans right now. Please try again.')
  }

  if (plans.length > 0) {
    const { error: priceError } = await supabase.from('gym_plan_prices').upsert(
      { gym_id: gym.id, ...getPlanPrices(plans), updated_at: new Date().toISOString() },
      { onConflict: 'gym_id' },
    )
    if (priceError) {
      log.error('Plans saved but gym_plan_prices sync failed', { code: priceError.code, error: priceError.message })
      return apiError(500, 'PLAN_SYNC_ERROR', 'Your plans were saved, but import prices could not be updated. Save again to retry.')
    }
  }

  return apiSuccess({ plans })
}, { rateLimit: 20 })
