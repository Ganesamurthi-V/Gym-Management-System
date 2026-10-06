import { NextRequest, NextResponse } from 'next/server'
import { getResend, getWebhookSecret } from '@/lib/email'
import { ingestReceivedEmail } from '@/lib/email-inbox'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/email/inbound  - Resend's `email.received` webhook.
 *
 * Public in middleware.ts, because Resend is not an admin session: the request proves
 * itself with a Svix signature over the raw body instead. Anything that fails that check
 * is rejected before a byte of it is read as data.
 *
 * The webhook carries only metadata, so ingestReceivedEmail fetches the full message.
 * Status codes matter to Resend, which retries on anything but 2xx:
 *   401  bad or missing signature (a retry would fail the same way)
 *   200  stored, a duplicate, or an event type we do not handle
 *   500  we could not fetch or store it, so Resend should try again
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('EMAIL_INBOUND', req)

  // The signature is computed over the exact bytes sent, so the body must be read as text
  // and handed over untouched. Parsing and re-serialising it would break verification.
  const payload = await req.text()
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signature = req.headers.get('svix-signature')

  if (!id || !timestamp || !signature) {
    log.summary(401)
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  let event
  try {
    event = getResend().webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: getWebhookSecret(),
    })
  } catch {
    log.summary(401)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (event.type !== 'email.received') {
    log.summary(200)
    return NextResponse.json({ ok: true, ignored: event.type })
  }

  try {
    log.start('INGEST')
    const result = await ingestReceivedEmail(event.data.email_id)
    log.end('INGEST')
    log.summary(200)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    log.error('Failed to ingest received email', error)
    log.summary(500)
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 })
  }
}
