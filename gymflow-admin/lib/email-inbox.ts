import { createAdminClient } from '@/lib/supabase-admin'
import { getResend } from '@/lib/email'
import {
  extractMessageIds,
  header,
  htmlToText,
  isAutoMail,
  normalizeSubject,
  parseAddress,
  parseAuthResults,
} from '@/lib/email-threading'

type Db = ReturnType<typeof createAdminClient>

/** How far back a same-sender, same-subject message may join an existing thread. */
const SUBJECT_MATCH_WINDOW_DAYS = 30

/** Longest body we keep. A pasted log or a forwarded chain should not bloat the table. */
const MAX_BODY_CHARS = 200_000

export type IngestResult =
  | { status: 'stored'; threadId: string; messageId: string }
  | { status: 'duplicate' }

/**
 * Stores one received email: fetches the full message from Resend (the webhook carries
 * only metadata), finds or creates its thread, and inserts the message.
 *
 * Idempotent on `resendEmailId`: Resend retries a webhook until it gets a 2xx, and the
 * same email arriving twice must leave exactly one row. The UNIQUE column is the real
 * guard; the early lookup just avoids the fetch on a plain retry.
 *
 * Throws when Resend cannot return the message, so the route answers 5xx and Resend
 * retries, rather than acknowledging mail that was never saved.
 */
export async function ingestReceivedEmail(resendEmailId: string): Promise<IngestResult> {
  const db = createAdminClient()

  const { data: existing } = await db
    .from('email_messages')
    .select('id')
    .eq('resend_email_id', resendEmailId)
    .maybeSingle()
  if (existing) return { status: 'duplicate' }

  const { data: mail, error: fetchError } = await getResend().emails.receiving.get(resendEmailId)
  if (fetchError || !mail) {
    throw new Error(`Resend could not return received email ${resendEmailId}: ${fetchError?.message ?? 'no data'}`)
  }

  const from = parseAddress(mail.from)
  const headers = mail.headers ?? null
  const messageId = mail.message_id || header(headers, 'message-id')
  const inReplyTo = extractMessageIds(header(headers, 'in-reply-to'))[0] ?? null
  const references = extractMessageIds(header(headers, 'references'))
  const subject = (mail.subject ?? '').trim() || '(no subject)'
  const bodyText = (mail.text?.trim() || (mail.html ? htmlToText(mail.html) : '') || '').slice(0, MAX_BODY_CHARS)

  const threadId = await findOrCreateThread(db, {
    fromEmail: from.email,
    fromName: from.name,
    subject,
    candidateIds: [...(inReplyTo ? [inReplyTo] : []), ...references],
  })

  const { data: row, error: insertError } = await db
    .from('email_messages')
    .insert({
      thread_id: threadId,
      direction: 'inbound',
      resend_email_id: resendEmailId,
      message_id: messageId,
      in_reply_to: inReplyTo,
      references_ids: references,
      from_email: from.email,
      from_name: from.name,
      to_emails: mail.to ?? [],
      subject,
      body_text: bodyText,
      body_html: mail.html ? mail.html.slice(0, MAX_BODY_CHARS * 2) : null,
      auth_result: parseAuthResults(headers),
      attachments: (mail.attachments ?? []).map((a: { id: string; filename: string | null; content_type: string; size: number }) => ({
        id: a.id,
        filename: a.filename,
        content_type: a.content_type,
        size: a.size,
      })),
      is_auto: isAutoMail(headers, mail.from),
      status: 'received',
      created_at: mail.created_at,
    })
    .select('id')
    .single()

  // 23505 = unique_violation: a concurrent retry stored it first. That is success.
  if (insertError?.code === '23505') return { status: 'duplicate' }
  if (insertError || !row) throw new Error(`Could not store email ${resendEmailId}: ${insertError?.message}`)

  return { status: 'stored', threadId, messageId: row.id }
}

interface ThreadInput {
  fromEmail: string
  fromName: string | null
  subject: string
  /** In-Reply-To first, then References, in the order the mail lists them. */
  candidateIds: string[]
}

/**
 * Thread matching, strongest evidence first:
 *   1. a message we already hold whose Message-ID the new mail replies to or references;
 *   2. the same sender with the same subject (Re:/Fwd: stripped) in the last 30 days;
 *   3. otherwise a new thread.
 * Rule 1 is what keeps a reply from a different address or with an edited subject in the
 * right conversation; rule 2 catches clients that drop the reply headers.
 */
async function findOrCreateThread(db: Db, input: ThreadInput): Promise<string> {
  if (input.candidateIds.length) {
    const { data } = await db
      .from('email_messages')
      .select('thread_id')
      .in('message_id', input.candidateIds)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data?.[0]) return data[0].thread_id as string
  }

  const subject = normalizeSubject(input.subject)
  const since = new Date(Date.now() - SUBJECT_MATCH_WINDOW_DAYS * 86_400_000).toISOString()
  const { data: bySubject } = await db
    .from('email_threads')
    .select('id')
    .eq('counterparty_email', input.fromEmail)
    .eq('subject', subject)
    .gte('last_message_at', since)
    .order('last_message_at', { ascending: false })
    .limit(1)
  if (bySubject?.[0]) return bySubject[0].id as string

  // A sender who is a gym owner gets the thread tied to that gym, so the app can jump to
  // it. Everyone else (website enquiries, prospects) is simply null.
  const { data: gymId } = await db.rpc('gym_id_for_owner_email', { p_email: input.fromEmail })

  const { data: created, error } = await db
    .from('email_threads')
    .insert({
      subject,
      counterparty_email: input.fromEmail,
      counterparty_name: input.fromName,
      gym_id: (gymId as string | null) ?? null,
    })
    .select('id')
    .single()
  if (error || !created) throw new Error(`Could not create thread: ${error?.message}`)
  return created.id as string
}
