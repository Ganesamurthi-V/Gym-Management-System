import { withAuth, apiSuccess, apiError } from '@/lib/api/withAuth'
import { importMaxRowsForDisplay } from '@/lib/subscription-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/import/limits
 *
 * Lets the upload step warn about the plan's import cap before a file is chosen.
 * Both inputs come from the database for the session's gym; nothing is read from
 * the client. /api/import/confirm enforces the same cap, this is only a preview.
 */
export const GET = withAuth('IMPORT_LIMITS_GET', async (_req, { gym, supabase, log }) => {
  const [planRes, countRes] = await Promise.all([
    supabase.from('gyms').select('plan_type').eq('id', gym.id).single(),
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
  ])
  if (planRes.error || countRes.error) {
    log.error('import limits lookup failed', planRes.error ?? countRes.error)
    return apiError(500, 'DATABASE_ERROR', 'Could not load import limits.')
  }

  const plan = planRes.data.plan_type as string
  return apiSuccess({ plan, maxRows: importMaxRowsForDisplay(plan, countRes.count ?? 0) })
})
