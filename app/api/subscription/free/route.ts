import { withAuth, apiError, apiSuccess } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

// The RPC derives the caller from auth.uid() and re-checks owner, trial and member
// count itself, so no body is read: nothing the browser sends can pick the gym or plan.
export const POST = withAuth('SUBSCRIPTION_FREE_POST', async (_req, { supabase, log }) => {
  const { error } = await supabase.rpc('owner_switch_to_free')
  if (error) {
    // 42501 = not owner / not on an ended trial; 23514 = more than the plan member limit.
    if (error.code === '42501' || error.code === '23514') {
      return apiError(403, 'FREE_PLAN_REFUSED', error.message)
    }
    log.error('owner_switch_to_free failed', error)
    return apiError(500, 'INTERNAL_ERROR', 'Could not switch to the free forever plan. Please try again.')
  }
  return apiSuccess({}, 200)
}, { allowWhenExpired: true })
