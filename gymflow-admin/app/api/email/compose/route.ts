import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { getResend, getSupportMailbox } from '@/lib/email'
import { renderReplyHtmlFromBody } from '@/lib/email-html'
import { markupToHtml, markupToPlain } from '@/lib/email-format'
import { readInput } from '@/lib/email-reply-input'
import { newMessageId, normalizeSubject } from '@/lib/email-threading'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/email/compose
 *   JSON { to, subject, text }, or multipart form data with the same fields plus files under
 *   "attachments" (same limits and markup as a reply, see lib/email-reply-input.ts).
 *
 * Starts a new conversation with someone who has already written to the support address.
 * That rule is enforced here, not only in the app: the recipient must match the address of an
 * existing thread, so this route cannot be used to mail an arbitrary address from
 * support@. The sent mail carries a fresh Message-ID, so the customer's reply lands back in
 * the same conversation through the usual threading.
 *
 * If the send fails, the conversation created for it is removed again and the request fails:
 * nothing is left half-made, and the admin simply presses Send again with everything intact.
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('EMAIL_COMPOSE', req)
  log.adminAction = 'email_compose'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_send', RATE_LIMITS.EMAIL_SEND.limit, RATE_LIMITS.EMAIL_SEND.window)
  if (limited) { log.summary(429); return limited }

  const input = await readInput(req)
  if (!input.ok) {
    log.summary(400)
    return NextResponse.json({ error: input.error }, { status: 400 })
  }
  if (!input.to || !input.subject) {
    log.summary(400)
    return NextResponse.json({ error: !input.to ? 'Choose who to write to' : 'Add a subject' }, { status: 400 })
  }
  const { to, subject, files } = input
  const bodyPlain = markupToPlain(input.text)
  const bodyHtml = markupToHtml(input.text)

  try {
    const db = createAdminClient()
    const mailbox = getSupportMailbox()

    if (to === mailbox.address) {
      log.summary(400)
      return NextResponse.json({ error: 'Cannot write to our own address' }, { status: 400 })
    }

    // The recipient must already be a correspondent. The newest thread also supplies the name
    // and the gym link, so the new conversation shows up with the same details.
    const { data: known } = await db
      .from('email_threads')
      .select('counterparty_name, gym_id')
      .eq('counterparty_email', to)
      .order('last_message_at', { ascending: false })
      .limit(1)
    if (!known?.length) {
      log.summary(403)
      return NextResponse.json({ error: 'You can only write to people who have emailed support' }, { status: 403 })
    }

    const { data: thread, error: threadError } = await db
      .from('email_threads')
      .insert({
        subject: normalizeSubject(subject),
        counterparty_email: to,
        counterparty_name: known[0].counterparty_name,
        gym_id: known[0].gym_id,
      })
      .select('id')
      .single()
    if (threadError || !thread) throw threadError ?? new Error('Could not create the conversation')

    const domain = mailbox.address.split('@')[1] ?? 'gymflow.sbs'
    const messageId = newMessageId(domain)
    const attachmentMeta = files.map(f => ({
      id: crypto.randomUUID(), filename: f.filename, content_type: f.contentType, size: f.buffer.length,
    }))

    const { data: row, error: rowError } = await db
      .from('email_messages')
      .insert({
        thread_id: thread.id,
        direction: 'outbound',
        message_id: messageId,
        references_ids: [],
        from_email: mailbox.address,
        from_name: 'GymFlow Support',
        to_emails: [to],
        subject,
        body_text: bodyPlain,
        body_html: bodyHtml,
        attachments: attachmentMeta,
        status: 'sending',
      })
      .select('id')
      .single()
    if (rowError || !row) {
      await db.from('email_threads').delete().eq('id', thread.id)
      throw rowError ?? new Error('Could not store the message')
    }

    log.start('RESEND_SEND')
    const { data: sent, error: sendError } = await getResend().emails.send(
      {
        from: mailbox.from,
        to: [to],
        subject,
        text: bodyPlain,
        html: renderReplyHtmlFromBody(bodyHtml),
        ...(files.length && { attachments: files.map(f => ({ filename: f.filename, content: f.buffer })) }),
        headers: { 'Message-ID': messageId },
      },
      { idempotencyKey: `email-compose-${row.id}` },
    )
    log.end('RESEND_SEND')

    if (sendError || !sent) {
      // Nothing was delivered: remove what was made for it (the message goes with its thread).
      await db.from('email_threads').delete().eq('id', thread.id)
      log.error('Resend rejected the new email', sendError)
      log.summary(502)
      return NextResponse.json({ error: sendError?.message ?? 'Could not send the email' }, { status: 502 })
    }

    await db.from('email_messages').update({ status: 'sent', resend_email_id: sent.id }).eq('id', row.id)

    log.summary(200)
    return NextResponse.json({ ok: true, threadId: thread.id })
  } catch (error) {
    log.error('Failed to send a new email', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to send the email' }, { status: 500 })
  }
}
