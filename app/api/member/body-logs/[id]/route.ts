import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { passesCsrfCheck, apiError, apiSuccess } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/** DELETE /api/member/body-logs/[id]: removes one of the caller's own entries (404 for anyone else's). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!passesCsrfCheck(req)) return apiError(403, 'FORBIDDEN', 'Forbidden')

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return apiError(400, 'VALIDATION_ERROR', 'Invalid id.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError(401, 'FORBIDDEN', 'Unauthorized')

  const { allowed } = await checkRateLimit(user.id, 'DELETE /api/member/body-logs', 30)
  if (!allowed) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  const { data: deleted, error } = await supabase.rpc('delete_body_log', { p_id: id } as never)
  if (error) {
    if (error.message === 'NOT_MEMBER') return apiError(403, 'FORBIDDEN', 'Forbidden')
    logger.error('body_log_delete_failed', { error: error.message })
    return apiError(500, 'SERVER_ERROR', 'Could not delete. Please try again.')
  }
  if (!deleted) return apiError(404, 'NOT_FOUND', 'Entry not found.')
  return apiSuccess({ id })
}
