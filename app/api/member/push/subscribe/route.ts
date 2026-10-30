import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { passesCsrfCheck, apiError, apiSuccess } from '@/lib/api/withAuth'
import { pushSubscriptionSchema, unsubscribeSchema } from '@/lib/push/validate'
import { isPushConfigured } from '@/lib/push/config'

export const dynamic = 'force-dynamic'

const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  NOT_MEMBER: { status: 403, code: 'FORBIDDEN', message: 'Forbidden' },
  MEMBER_APP_BLOCKED: { status: 403, code: 'FORBIDDEN', message: 'Forbidden' },
  INVALID_VALUE: { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid subscription.' },
}

/** Never cache; the body carries nothing but { ok }. Endpoints and keys are never echoed. */
function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

/**
 * Shared by POST and DELETE. Not wrapped in withAuth (members own no gym): the member is derived from
 * auth.uid() inside the SQL function, which also enforces the plan gate. Nothing identifying the
 * member or gym is accepted from the body.
 */
async function handle(req: NextRequest, mode: 'subscribe' | 'unsubscribe'): Promise<NextResponse> {
  if (!passesCsrfCheck(req)) return noStore(apiError(403, 'FORBIDDEN', 'Forbidden'))
  if (mode === 'subscribe' && !isPushConfigured()) return noStore(apiError(503, 'SERVER_ERROR', 'Notifications are not available.'))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return noStore(apiError(401, 'FORBIDDEN', 'Unauthorized'))

  // checkRateLimit is per minute: 10/min bounds a runaway client; real use is a few calls a day.
  const { allowed } = await checkRateLimit(user.id, `${mode} /api/member/push/subscribe`, 10)
  if (!allowed) return noStore(apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'))

  let raw: unknown
  try { raw = await req.json() } catch { return noStore(apiError(400, 'VALIDATION_ERROR', 'Invalid JSON')) }

  const rpc = mode === 'subscribe'
    ? (() => {
        const parsed = pushSubscriptionSchema.safeParse(raw)
        if (!parsed.success) return null
        return supabase.rpc('register_push_subscription', {
          p_endpoint: parsed.data.endpoint,
          p_p256dh: parsed.data.keys.p256dh,
          p_auth: parsed.data.keys.auth,
          p_user_agent: parsed.data.userAgent ?? null,
        } as never)
      })()
    : (() => {
        const parsed = unsubscribeSchema.safeParse(raw)
        if (!parsed.success) return null
        return supabase.rpc('unregister_push_subscription', { p_endpoint: parsed.data.endpoint } as never)
      })()
  if (!rpc) return noStore(apiError(400, 'VALIDATION_ERROR', 'Invalid subscription.'))

  const { error } = await rpc
  if (error) {
    const known = RPC_ERRORS[error.message]
    if (known) return noStore(apiError(known.status, known.code, known.message))
    logger.error('push_subscribe_failed', { mode, error: error.message })
    return noStore(apiError(500, 'SERVER_ERROR', 'Could not update notifications. Please try again.'))
  }
  return noStore(apiSuccess({ ok: true }))
}

export const POST = (req: NextRequest) => handle(req, 'subscribe')
export const DELETE = (req: NextRequest) => handle(req, 'unsubscribe')
