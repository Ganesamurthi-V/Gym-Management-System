import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeSupportMessage, sanitizeUUID } from '@/lib/sanitize'
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

  const rawBody = await req.json().catch(() => null)
  if (!rawBody || typeof rawBody !== 'object') {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Broadcast: `gym_ids` (array) targets several gyms in one call; the single `gym_id`
  // form still works for existing clients. One request = one rate-limit hit.
  const rawIds: unknown[] = Array.isArray((rawBody as any).gym_ids) ? (rawBody as any).gym_ids : [(rawBody as any).gym_id]
  const gymIds = [...new Set(rawIds.map((id) => (typeof id === 'string' ? sanitizeUUID(id) : null)))]
  if (gymIds.length === 0 || gymIds.length > 200 || gymIds.some((id) => !id)) {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid gym ID' }, { status: 400 })
  }

  // Validates subject/body/type once; gym_id is checked above.
  const sanitized = sanitizeSupportMessage({ ...(rawBody as object), gym_id: gymIds[0] })
  if ('error' in sanitized) {
    log.warn('Invalid support message input', { error: sanitized.error })
    log.summary(400)
    return NextResponse.json({ error: sanitized.error }, { status: 400 })
  }

  const { subject, body, type } = sanitized

  log.start('DB_GYM_CHECK')
  const supabase = createAdminClient()
  const { data: found, error: gymErr } = await supabase.from('gyms').select('id').in('id', gymIds as string[])
  log.end('DB_GYM_CHECK')

  if (gymErr) {
    log.error('Failed to look up target gyms', gymErr)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
  if (!found || found.length !== gymIds.length) {
    log.warn('Support message target gym not found', { requested: gymIds.length, found: found?.length ?? 0 })
    log.summary(404)
    return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
  }

  log.start('DB_INSERT')
  const { data, error } = await supabase
    .from('admin_messages')
    .insert(gymIds.map((gymId) => ({ gym_id: gymId, subject, body, type, sent_by: 'super_admin' })))
    .select()
  log.end('DB_INSERT')

  if (error) {
    log.error('Failed to insert support message', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  await Promise.all(gymIds.map((gymId) => invalidatePattern(`gym:${gymId}:admin_messages`)))

  log.info('Support message sent', { gyms: gymIds.length, type })
  log.summary(200)
  return NextResponse.json({ ok: true, message: data[0], count: data.length })
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
