import { NextRequest } from 'next/server'
import { withAuth, apiError, apiSuccess, isValidUUID } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** GET /api/renewal-requests/[id]/proof  ->  { url, isPdf } (signed URL valid for 60 s; the raw path is never returned) */
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

  // Belt and braces: the file must sit under this gym's folder.
  if (!request.proof_path.startsWith(`${gym.id}/`)) {
    log.error('Proof path outside gym prefix', { id })
    return apiError(404, 'NOT_FOUND', 'Request not found')
  }

  const { data, error: signError } = await createAdminClient()
    .storage.from('member_payment_proofs')
    .createSignedUrl(request.proof_path, 60)
  if (signError || !data?.signedUrl) {
    log.error('Proof signed URL failed', signError)
    return apiError(500, 'SERVER_ERROR', 'Could not load the proof.')
  }

  return apiSuccess({ url: data.signedUrl, isPdf: request.proof_path.toLowerCase().endsWith('.pdf') })
}, { rateLimit: 60 })
