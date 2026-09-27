import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

/**
 * POST /api/push/register-token
 * The mobile app posts its FCM registration token on launch/login. Tokens are
 * keyed per device (admin auth carries no per-user identity), so we upsert on
 * the token and bump last_seen_at. Stale tokens are pruned by the dispatcher
 * when FCM reports them unregistered.
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('ADMIN_PUSH_REGISTER', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'push_register', RATE_LIMITS.TICKET_RESOLVE.limit, RATE_LIMITS.TICKET_RESOLVE.window)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  try {
    const body = await req.json().catch(() => null) as { token?: string; platform?: string } | null
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const platform = body?.platform === 'ios' ? 'ios' : 'android'

    // FCM tokens are long opaque strings; reject obvious junk without being
    // strict about the exact format (it changes across FCM versions).
    if (!token || token.length < 20 || token.length > 4096) {
      log.summary(400)
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('device_push_tokens')
      .upsert(
        { token, platform, last_seen_at: now },
        { onConflict: 'token' }
      )
    if (error) throw error

    log.summary(200)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    log.error('Failed to register push token', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to register token' }, { status: 500 })
  }
}
