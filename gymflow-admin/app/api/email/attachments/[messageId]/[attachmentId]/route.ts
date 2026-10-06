import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { getResend } from '@/lib/email'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface StoredAttachment {
  id: string
  filename: string | null
  content_type: string
  size: number
}

/**
 * GET /api/email/attachments/[messageId]/[attachmentId]
 *
 * Returns a fresh download link for one attachment of a received email. Only metadata is
 * stored in our database; the bytes stay at Resend, whose links expire after an hour, so
 * a link is requested at the moment the admin taps the attachment rather than saved.
 * The attachment id must be one recorded for that message, which stops this route being
 * used to ask Resend for anything else.
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ messageId: string; attachmentId: string }> },
) {
  const log = apiLogger('EMAIL_ATTACHMENT', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_attachment', RATE_LIMITS.EMAIL_READ.limit, RATE_LIMITS.EMAIL_READ.window)
  if (limited) { log.summary(429); return limited }

  const params = await props.params
  const messageId = sanitizeUUID(params.messageId)
  const attachmentId = params.attachmentId
  if (!messageId || !/^[\w-]{1,100}$/.test(attachmentId)) {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const { data: message } = await createAdminClient()
      .from('email_messages')
      .select('resend_email_id, attachments, direction')
      .eq('id', messageId)
      .maybeSingle()

    const known = ((message?.attachments ?? []) as StoredAttachment[]).find(a => a.id === attachmentId)
    if (!message?.resend_email_id || message.direction !== 'inbound' || !known) {
      log.summary(404)
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    const { data, error } = await getResend().emails.receiving.attachments.get({
      emailId: message.resend_email_id,
      id: attachmentId,
    })
    if (error || !data) throw error ?? new Error('No attachment data')

    log.summary(200)
    return NextResponse.json({
      url: data.download_url,
      expiresAt: data.expires_at,
      filename: known.filename ?? 'attachment',
      contentType: known.content_type,
      size: known.size,
    })
  } catch (error) {
    log.error('Failed to get attachment link', error)
    log.summary(502)
    return NextResponse.json({ error: 'Could not get the attachment' }, { status: 502 })
  }
}
