import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/email/messages/[id]
 *
 * Deletes ONE message from a conversation, not the conversation. The thread row is a summary
 * kept in step by a trigger that only runs on insert (last message time, snippet, direction,
 * unread count), so after a delete it is recomputed here from what is left. If that was the
 * only message, the empty conversation goes with it and `threadDeleted` says so.
 */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const log = apiLogger('EMAIL_MESSAGE_DELETE', req)
  log.adminAction = 'email_message_delete'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_message_delete', RATE_LIMITS.EMAIL_READ.limit, RATE_LIMITS.EMAIL_READ.window)
  if (limited) { log.summary(429); return limited }

  const messageId = sanitizeUUID((await props.params).id)
  if (!messageId) {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid message id' }, { status: 400 })
  }

  try {
    const db = createAdminClient()

    const { data: message } = await db.from('email_messages').select('id, thread_id').eq('id', messageId).maybeSingle()
    if (!message) {
      // Already gone (a double swipe, or another device): the goal is met.
      log.summary(200)
      return NextResponse.json({ ok: true, threadDeleted: false })
    }
    const threadId = message.thread_id as string

    const { error } = await db.from('email_messages').delete().eq('id', messageId)
    if (error) throw error

    const { data: left, error: leftError } = await db
      .from('email_messages')
      .select('direction, body_text, created_at, read_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
    if (leftError) throw leftError

    if (!left || left.length === 0) {
      await db.from('email_threads').delete().eq('id', threadId)
      log.summary(200)
      return NextResponse.json({ ok: true, threadDeleted: true })
    }

    const newest = left[0]
    await db
      .from('email_threads')
      .update({
        last_message_at: newest.created_at,
        last_direction: newest.direction,
        snippet: ((newest.body_text as string | null) ?? '').replace(/\s+/g, ' ').slice(0, 140),
        unread_count: left.filter(m => m.direction === 'inbound' && !m.read_at).length,
      })
      .eq('id', threadId)

    log.summary(200)
    return NextResponse.json({ ok: true, threadDeleted: false })
  } catch (error) {
    log.error('Failed to delete email message', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to delete the message' }, { status: 500 })
  }
}
