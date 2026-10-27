import { NextRequest } from 'next/server'
import { withAuth, apiError, apiSuccess, isValidUUID } from '@/lib/api/withAuth'
import { rejectRenewalSchema } from '@/lib/renewal/validate'
import { publishPushJob } from '@/lib/push/publish'
import { PUSH_COPY } from '@/lib/push/payload'

export const dynamic = 'force-dynamic'

/** POST /api/renewal-requests/[id]/reject   body: { reason: string (3-300 chars) } */
export const POST = withAuth('RENEWAL_REQUEST_REJECT', async (req: NextRequest, { supabase, gym, log }) => {
  const id = req.nextUrl.pathname.split('/').at(-2) ?? ''
  if (!isValidUUID(id)) return apiError(400, 'NOT_FOUND', 'Invalid request id')

  let body: unknown
  try { body = await req.json() } catch {
    return apiError(400, 'BAD_REQUEST', 'Invalid JSON')
  }
  const parsed = rejectRenewalSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'BAD_REQUEST', 'Give a reason of 3 to 300 characters.')

  // Read first (scoped to this gym) so we know whom to notify. Best effort: the RPC below still decides
  // everything, and a failed read only means no push.
  const { data: before } = await supabase
    .from('member_renewal_requests')
    .select('member_id, request_type, status')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .maybeSingle()

  // Ownership and the pending check are enforced inside the function (auth.uid() = gym owner).
  const { error } = await supabase.rpc('reject_member_renewal_request', {
    p_request_id: id,
    p_reason: parsed.data.reason,
  })
  if (error) {
    if (error.message === 'NOT_PENDING') return apiError(409, 'NOT_PENDING', 'This request was already reviewed.')
    if (error.message === 'NOT_FOUND') return apiError(404, 'NOT_FOUND', 'Request not found')
    if (error.message === 'INVALID_REASON') return apiError(400, 'BAD_REQUEST', 'Give a reason of 3 to 300 characters.')
    log.error('Reject renewal failed', error)
    return apiError(500, 'SERVER_ERROR', 'Could not reject the request. Please try again.')
  }
  // The RPC refuses anything not pending, so reaching here means a real pending -> rejected transition.
  if (before?.member_id && before.status === 'pending') {
    void publishPushJob({
      gymId: gym.id, kind: 'payment_decision', ref: `${id}-rejected`, memberIds: [before.member_id],
      body: before.request_type === 'due' ? PUSH_COPY.dueRejected : PUSH_COPY.renewalRejected, url: '/m/notifications',
    }).catch(err => log.error('Rejection push publish failed', err))
  }
  return apiSuccess({ id })
}, { rateLimit: 30 })
