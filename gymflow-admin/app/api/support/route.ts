import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeSupportMessage } from '@/lib/sanitize'
import { invalidatePattern } from '@/lib/cache'
import { apiLogger } from '@/lib/logger'

// POST /api/support — send a message to a gym owner
export async function POST(req: NextRequest) {
  const log = apiLogger('ADMIN_SUPPORT_SEND', req)
  log.adminAction = 'send_support_message'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'support_message', RATE_LIMITS.SUPPORT_MESSAGE.limit, RATE_LIMITS.SUPPORT_MESSAGE.window)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  const rawBody = await req.json()

  const sanitized = sanitizeSupportMessage(rawBody)
  if ('error' in sanitized) {
    log.warn('Invalid support message input', { error: sanitized.error })
    log.summary(400)
    return NextResponse.json({ error: sanitized.error }, { status: 400 })
  }

  const { gymId, subject, body, type } = sanitized

  log.start('DB_GYM_CHECK')
  const supabase = createAdminClient()
  const { data: gym } = await supabase.from('gyms').select('id').eq('id', gymId).single()
  log.end('DB_GYM_CHECK')

  if (!gym) {
    log.warn('Support message target gym not found', { gymId })
    log.summary(404)
    return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
  }

  log.start('DB_INSERT')
  const { data, error } = await supabase
    .from('admin_messages')
    .insert({ gym_id: gymId, subject, body, type, sent_by: 'super_admin' })
    .select()
    .single()
  log.end('DB_INSERT')

  if (error) {
    log.error('Failed to insert support message', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  await invalidatePattern(`gym:${gymId}:admin_messages`)

  log.info('Support message sent', { gymId, type })
  log.summary(200)
  return NextResponse.json({ ok: true, message: data })
}

// GET /api/support — get all messages with gym info
export async function GET(req: NextRequest) {
  const log = apiLogger('ADMIN_SUPPORT_LIST', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'support_list', RATE_LIMITS.GYM_LIST.limit, RATE_LIMITS.GYM_LIST.window)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  log.start('DB_QUERY')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('admin_messages')
    .select('*, gym:gym_id(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  log.end('DB_QUERY')

  if (error) {
    log.error('Failed to fetch support messages', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  log.summary(200)
  return NextResponse.json(data)
}
