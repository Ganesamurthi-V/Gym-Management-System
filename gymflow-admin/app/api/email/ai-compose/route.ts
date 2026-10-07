import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { composeEmail } from '@/lib/ai-compose'
import { stripQuotedReply } from '@/lib/email-threading'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  instruction: z.string().trim().min(3, 'Tell the AI what to write').max(1_000),
  // Either an address that has written to us, or a thread being answered. Both only supply
  // background (a name, a gym, the last thing they wrote); neither is required.
  to: z.string().trim().toLowerCase().email().optional(),
  threadId: z.string().optional(),
})

/**
 * POST /api/email/ai-compose  { instruction, to?, threadId? }  ->  { subject, body }
 *
 * Writes an email from the admin's instruction. Nothing is sent or stored: the app puts the
 * text in the editor and the admin sends it, after editing, with the normal send button.
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('EMAIL_AI_COMPOSE', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_ai_compose', RATE_LIMITS.EMAIL_DRAFT.limit, RATE_LIMITS.EMAIL_DRAFT.window)
  if (limited) { log.summary(429); return limited }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    log.summary(400)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { instruction, to } = parsed.data
  const threadId = parsed.data.threadId ? sanitizeUUID(parsed.data.threadId) : null

  try {
    const db = createAdminClient()

    // Background about the recipient, from the thread being answered or their latest thread.
    let thread: { id: string; counterparty_name: string | null; gym_id: string | null } | null = null
    if (threadId) {
      const { data } = await db.from('email_threads').select('id, counterparty_name, gym_id').eq('id', threadId).maybeSingle()
      thread = data
    } else if (to) {
      const { data } = await db
        .from('email_threads')
        .select('id, counterparty_name, gym_id')
        .eq('counterparty_email', to)
        .order('last_message_at', { ascending: false })
        .limit(1)
      thread = data?.[0] ?? null
    }

    let gymNames: string[] = []
    if (thread?.gym_id) {
      const { data: linked } = await db.from('gyms').select('owner_id').eq('id', thread.gym_id).maybeSingle()
      if (linked?.owner_id) {
        const { data: owned } = await db.from('gyms').select('name').eq('owner_id', linked.owner_id).order('created_at', { ascending: true }).limit(5)
        gymNames = (owned ?? []).map(g => (g.name as string | null)?.trim() ?? '').filter(Boolean)
      }
    }

    let earlierEmail: string | null = null
    if (thread) {
      const { data: last } = await db
        .from('email_messages')
        .select('body_text')
        .eq('thread_id', thread.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
      const text = stripQuotedReply((last?.[0]?.body_text as string | null) ?? '').trim()
      earlierEmail = text || null
    }

    log.start('AI')
    const result = await composeEmail({ instruction, recipientName: thread?.counterparty_name ?? null, gymNames, earlierEmail })
    log.end('AI')

    if (!result.ok) {
      const status = result.reason === 'limit' ? 429 : result.reason === 'unavailable' ? 503 : 502
      log.summary(status)
      return NextResponse.json({ error: result.message }, { status })
    }

    log.summary(200)
    return NextResponse.json({ subject: result.subject, body: result.body })
  } catch (error) {
    log.error('Failed to compose with AI', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to write the email' }, { status: 500 })
  }
}
