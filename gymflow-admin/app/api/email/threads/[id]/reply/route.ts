import { renderReplyHtml } from '@/lib/email-html'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { getResend, getSupportMailbox } from '@/lib/email'
import { newMessageId, normalizeSubject } from '@/lib/email-threading'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const MAX_REPLY_CHARS = 10_000

const bodySchema = z.object({
  text: z.string().trim().min(1, 'Write a reply first').max(MAX_REPLY_CHARS),
  // Set when the app retries a reply that failed to send, so it reuses that row instead
  // of leaving a failed duplicate behind.
  retryMessageId: z.string().uuid().optional(),
})

/**
 * POST /api/email/threads/[id]/reply  { text }
 *
 * Sends the admin's reply and stores it in the thread. Two rules are fixed here so the
 * app cannot bend them:
 *   - the recipient is always the thread's other party. The request carries no address,
 *     so this route cannot be used to mail someone arbitrary from support@gymflow.sbs;
 *   - the reply carries In-Reply-To and References, so Gmail, Outlook and Apple Mail
 *     file it in the same conversation as the mail it answers.
 *
 * The row is written as 'sending' before the send, then 'sent' or 'failed' after. A send
 * that dies halfway therefore leaves a visible failed message the admin can retry, not a
 * reply that may or may not have gone out.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const log = apiLogger('EMAIL_REPLY', req)
  log.adminAction = 'email_reply'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_send', RATE_LIMITS.EMAIL_SEND.limit, RATE_LIMITS.EMAIL_SEND.window)
  if (limited) { log.summary(429); return limited }

  const threadId = sanitizeUUID((await props.params).id)
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!threadId || !parsed.success) {
    log.summary(400)
    return NextResponse.json({ error: parsed.success ? 'Invalid thread id' : parsed.error.issues[0].message }, { status: 400 })
  }
  const { text, retryMessageId } = parsed.data

  try {
    const db = createAdminClient()
    const mailbox = getSupportMailbox()

    const { data: thread } = await db
      .from('email_threads')
      .select('id, subject, counterparty_email')
      .eq('id', threadId)
      .maybeSingle()
    if (!thread) {
      log.summary(404)
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }
    if (thread.counterparty_email === mailbox.address) {
      log.summary(400)
      return NextResponse.json({ error: 'Cannot reply to our own address' }, { status: 400 })
    }

    const { data: history } = await db
      .from('email_messages')
      .select('id, direction, message_id, created_at, status')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    // References lists every earlier Message-ID, oldest first; In-Reply-To is the newest
    // message the other party sent (what we are answering). Sent-and-failed rows never
    // reached the recipient, so their ids stay out of the chain.
    const reachable = (history ?? []).filter(m => m.message_id && m.status !== 'failed' && m.status !== 'sending')
    const references = [...new Set(reachable.map(m => m.message_id as string))]
    const lastInbound = [...reachable].reverse().find(m => m.direction === 'inbound')
    const inReplyTo = (lastInbound?.message_id ?? references[references.length - 1]) as string | undefined

    const subject = `Re: ${normalizeSubject(thread.subject)}`
    const domain = mailbox.address.split('@')[1] ?? 'gymflow.sbs'

    // Reuse a failed row on retry, otherwise write a new 'sending' row.
    let messageRowId: string
    let messageId: string
    if (retryMessageId) {
      const { data: failed } = await db
        .from('email_messages')
        .select('id, message_id')
        .eq('id', retryMessageId)
        .eq('thread_id', threadId)
        .eq('direction', 'outbound')
        .eq('status', 'failed')
        .maybeSingle()
      if (!failed) {
        log.summary(409)
        return NextResponse.json({ error: 'That message is not a failed reply' }, { status: 409 })
      }
      messageRowId = failed.id as string
      messageId = failed.message_id as string
      await db.from('email_messages').update({ status: 'sending', error: null, body_text: text }).eq('id', messageRowId)
    } else {
      messageId = newMessageId(domain)
      const { data: row, error: insertError } = await db
        .from('email_messages')
        .insert({
          thread_id: threadId,
          direction: 'outbound',
          message_id: messageId,
          in_reply_to: inReplyTo ?? null,
          references_ids: references,
          from_email: mailbox.address,
          from_name: 'GymFlow Support',
          to_emails: [thread.counterparty_email],
          subject,
          body_text: text,
          status: 'sending',
        })
        .select('id')
        .single()
      if (insertError || !row) throw insertError ?? new Error('Could not store reply')
      messageRowId = row.id as string
    }

    log.start('RESEND_SEND')
    const { data: sent, error: sendError } = await getResend().emails.send(
      {
        from: mailbox.from,
        to: [thread.counterparty_email],
        subject,
        text,
        html: renderReplyHtml(text),
        headers: {
          'Message-ID': messageId,
          ...(inReplyTo && { 'In-Reply-To': inReplyTo }),
          ...(references.length && { References: references.join(' ') }),
        },
      },
      // The row id makes the send idempotent: a request that is retried after a timeout
      // cannot deliver the same reply twice.
      { idempotencyKey: `email-reply-${messageRowId}` },
    )
    log.end('RESEND_SEND')

    if (sendError || !sent) {
      await db.from('email_messages').update({ status: 'failed', error: sendError?.message ?? 'Send failed' }).eq('id', messageRowId)
      log.error('Resend rejected the reply', sendError)
      log.summary(502)
      return NextResponse.json({ error: 'Could not send the reply', messageId: messageRowId }, { status: 502 })
    }

    await db.from('email_messages').update({ status: 'sent', resend_email_id: sent.id }).eq('id', messageRowId)

    log.summary(200)
    return NextResponse.json({ ok: true, messageId: messageRowId })
  } catch (error) {
    log.error('Failed to send reply', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 })
  }
}
