import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api/withAuth'
import { createNoticeSchema, mapNoticeRow, NOTICE_COLUMNS } from '@/lib/notices/validate'
import { publishPushJob } from '@/lib/push/publish'
import { PUSH_COPY } from '@/lib/push/payload'
import { todayIST } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const TOO_MANY_MESSAGE = 'You can have up to 20 active notices. Hide or delete an old one first.'

/**
 * POST /api/notices
 * Body: { kind, title, body, expires_on? }  ->  201 { notice: GymNotice }
 */
export const POST = withAuth(
  'NOTICES_CREATE',
  async (req: NextRequest, { supabase, gym, log }) => {
    let raw: unknown
    try { raw = await req.json() } catch {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid JSON')
    }
    const parsed = createNoticeSchema.safeParse(raw)
    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid notice')
    }

    const { data, error } = await supabase
      .from('gym_notices')
      .insert({ ...parsed.data, expires_on: parsed.data.expires_on ?? null, gym_id: gym.id })
      .select(NOTICE_COLUMNS)
      .single()

    if (error) {
      if (error.message?.includes('TOO_MANY_NOTICES')) {
        return apiError(409, 'TOO_MANY', TOO_MANY_MESSAGE)
      }
      log.error('Could not create notice', error)
      return apiError(500, 'SERVER_ERROR', 'Could not save the notice. Please try again.')
    }

    // Best effort and not awaited: a push problem must never fail or slow the owner's save.
    if (data.is_active && (!data.expires_on || data.expires_on >= todayIST())) {
      void publishPushJob({ gymId: gym.id, kind: 'notice', ref: data.id, body: PUSH_COPY.notice(data.title), url: '/m/notifications' })
        .catch(err => log.error('Notice push publish failed', err))
    }

    return apiSuccess({ notice: mapNoticeRow(data) }, 201)
  },
  { rateLimit: 30 },
)
