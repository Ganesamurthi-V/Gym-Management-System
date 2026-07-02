import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { apiLogger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const log = apiLogger('ADMIN_RESET_PASSWORD', req)
  log.adminAction = 'reset_password'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'reset_password', 5, 60)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  try {
    const { userId, password } = await req.json()

    if (!userId || !password || password.length < 8) {
      log.summary(400)
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const cleanUserId = sanitizeUUID(userId)
    if (!cleanUserId) {
      log.summary(400)
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    log.start('AUTH_ADMIN_UPDATE')
    const supabase = createAdminClient()
    const { error } = await supabase.auth.admin.updateUserById(cleanUserId, { password })
    log.end('AUTH_ADMIN_UPDATE')

    if (error) throw error

    log.info('Password reset successful', { userId: cleanUserId })
    log.summary(200)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    log.error('Failed to reset password', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
  }
}
