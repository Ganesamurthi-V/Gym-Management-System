import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api/withAuth'
import { gymPlansFromOnboarding } from '@/lib/import/gymPlans'

export const dynamic = 'force-dynamic'

/** GET /api/import/gym-plans - the gym's saved plans (Plans page), for linking imported plan values. */
export const GET = withAuth('IMPORT_GYM_PLANS', async (_req: NextRequest, { supabase, gym }) => {
  const { data, error } = await supabase.from('gyms').select('onboarding_data').eq('id', gym.id).single()
  if (error || !data) return apiError(500, 'DATABASE_ERROR', 'Could not load your plans')
  return apiSuccess({ plans: gymPlansFromOnboarding(data.onboarding_data) })
})
