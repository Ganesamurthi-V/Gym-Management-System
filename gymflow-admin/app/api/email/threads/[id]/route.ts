import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/email/threads/[id]
 *
 * The thread and its messages, oldest first. Opening a thread is what marks it read, so
 * the unread badge clears when the admin actually looks and not when mail merely arrives.
 * HTML bodies are deliberately left out of the response: the app shows plain text only.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const log = apiLogger('EMAIL_THREAD_GET', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_thread', RATE_LIMITS.EMAIL_READ.limit, RATE_LIMITS.EMAIL_READ.window)
  if (limited) { log.summary(429); return limited }

  const threadId = sanitizeUUID((await props.params).id)
  if (!threadId) {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid thread id' }, { status: 400 })
  }

  try {
    const db = createAdminClient()
    log.start('DB_QUERY')
    const [thread, messages] = await Promise.all([
      db.from('email_threads')
        .select('id, subject, counterparty_email, counterparty_name, gym_id, status, unread_count, last_message_at, gyms(name)')
        .eq('id', threadId)
        .maybeSingle(),
      db.from('email_messages')
        .select('id, direction, from_email, from_name, to_emails, subject, body_text, auth_result, attachments, is_auto, status, error, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true }),
    ])
    log.end('DB_QUERY')

    if (thread.error) throw thread.error
    if (messages.error) throw messages.error
    if (!thread.data) {
      log.summary(404)
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    if (thread.data.unread_count > 0) {
      await Promise.all([
        db.from('email_threads').update({ unread_count: 0 }).eq('id', threadId),
        db.from('email_messages').update({ read_at: new Date().toISOString() })
          .eq('thread_id', threadId).eq('direction', 'inbound').is('read_at', null),
      ])
    }

    log.summary(200)
    return NextResponse.json({ thread: { ...thread.data, unread_count: 0 }, messages: messages.data ?? [] })
  } catch (error) {
    log.error('Failed to load email thread', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to load thread' }, { status: 500 })
  }
}

/** PATCH /api/email/threads/[id]  { status: 'open' | 'archived' } */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const log = apiLogger('EMAIL_THREAD_PATCH', req)
  log.adminAction = 'email_thread_status'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_thread_patch', RATE_LIMITS.EMAIL_READ.limit, RATE_LIMITS.EMAIL_READ.window)
  if (limited) { log.summary(429); return limited }

  const threadId = sanitizeUUID((await props.params).id)
  const body = await req.json().catch(() => null)
  if (!threadId || (body?.status !== 'open' && body?.status !== 'archived')) {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const { error } = await createAdminClient().from('email_threads').update({ status: body.status }).eq('id', threadId)
    if (error) throw error
    log.summary(200)
    return NextResponse.json({ ok: true })
  } catch (error) {
    log.error('Failed to update thread status', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to update thread' }, { status: 500 })
  }
}
