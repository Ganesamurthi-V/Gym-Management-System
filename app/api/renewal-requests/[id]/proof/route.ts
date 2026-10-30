import { NextRequest } from 'next/server'
import { withAuth, apiError, apiSuccess, isValidUUID } from '@/lib/api/withAuth'
import { proofPathBelongsToGym } from '@/lib/renewal/proof'

export const dynamic = 'force-dynamic'

/**
 * GET /api/renewal-requests/[id]/proof  ->  { url, isPdf }
 * `url` is this app's own file route (it re-checks the owner on every request); no storage link and no raw
 * path is ever returned.
 */
export const GET = withAuth('RENEWAL_REQUEST_PROOF', async (req: NextRequest, { gym, supabase, log }) => {
  const id = req.nextUrl.pathname.split('/').at(-2) ?? ''
  if (!isValidUUID(id)) return apiError(400, 'NOT_FOUND', 'Invalid request id')

  // RLS plus the explicit gym filter: another gym's request reads as not found.
  const { data: request, error } = await supabase
    .from('member_renewal_requests')
    .select('proof_path')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (error) {
    log.error('Proof lookup failed', error)
    return apiError(500, 'SERVER_ERROR', 'Could not load the proof.')
  }
  if (!request) return apiError(404, 'NOT_FOUND', 'Request not found')

  // The file must sit under this gym's folder.
  if (!proofPathBelongsToGym(request.proof_path, gym.id)) {
    log.error('Proof path outside gym prefix', { id })
    return apiError(404, 'NOT_FOUND', 'Request not found')
  }

  return apiSuccess({
    url: `/api/renewal-requests/${id}/proof/file`,
    isPdf: request.proof_path.toLowerCase().endsWith('.pdf'),
  })
}, { rateLimit: 60 })
