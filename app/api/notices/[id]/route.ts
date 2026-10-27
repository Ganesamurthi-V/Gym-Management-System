import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, isValidUUID } from '@/lib/api/withAuth'
import { updateNoticeSchema, mapNoticeRow, NOTICE_COLUMNS } from '@/lib/notices/validate'

export const dynamic = 'force-dynamic'

const TOO_MANY_MESSAGE = 'You can have up to 20 active notices. Hide or delete an old one first.'

// withAuth hands the handler only the request, so the id comes from the last path segment.
function noticeIdFrom(req: NextRequest): string | null {
  const id = req.nextUrl.pathname.split('/').filter(Boolean).pop() ?? ''
  return isValidUUID(id) ? id : null
}

/**
 * PATCH /api/notices/[id]
 * Body: partial { kind, title, body, expires_on, is_active }  ->  { notice: GymNotice }
 */
export const PATCH = withAuth(
  'NOTICES_UPDATE',
  async (req: NextRequest, { supabase, gym, log }) => {
    const id = noticeIdFrom(req)
    if (!id) return apiError(400, 'VALIDATION_ERROR', 'Invalid notice id')

    let raw: unknown
    try { raw = await req.json() } catch {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid JSON')
    }
    const parsed = updateNoticeSchema.safeParse(raw)
    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid notice')
    }
    if (Object.keys(parsed.data).length === 0) {
      return apiError(400, 'VALIDATION_ERROR', 'Nothing to update')
    }

    const { data, error } = await supabase
      .from('gym_notices')
      .update(parsed.data)
      .eq('id', id)
      .eq('gym_id', gym.id)
      .select(NOTICE_COLUMNS)
      .maybeSingle()

    if (error) {
      if (error.message?.includes('TOO_MANY_NOTICES')) {
        return apiError(409, 'TOO_MANY', TOO_MANY_MESSAGE)
      }
      log.error('Could not update notice', error)
      return apiError(500, 'SERVER_ERROR', 'Could not save the notice. Please try again.')
    }
    if (!data) return apiError(404, 'NOT_FOUND', 'Notice not found')

    return apiSuccess({ notice: mapNoticeRow(data) })
  },
  { rateLimit: 60 },
)

/** DELETE /api/notices/[id]  ->  { id } */
export const DELETE = withAuth(
  'NOTICES_DELETE',
  async (req: NextRequest, { supabase, gym, log }) => {
    const id = noticeIdFrom(req)
    if (!id) return apiError(400, 'VALIDATION_ERROR', 'Invalid notice id')

    const { data, error } = await supabase
      .from('gym_notices')
      .delete()
      .eq('id', id)
      .eq('gym_id', gym.id)
      .select('id')
      .maybeSingle()

    if (error) {
      log.error('Could not delete notice', error)
      return apiError(500, 'SERVER_ERROR', 'Could not delete the notice. Please try again.')
    }
    if (!data) return apiError(404, 'NOT_FOUND', 'Notice not found')

    return apiSuccess({ id })
  },
  { rateLimit: 60 },
)
