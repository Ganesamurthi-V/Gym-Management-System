import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { draftForThread } from '@/lib/ai-draft'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/email/threads/[id]/draft  - the Regenerate button.
 *
 * Writes a fresh draft for the newest inbound message, replacing the current one. It goes
 * through the same budgeting as an automatic draft (token reservation, the model fallback
 * chain, the daily cap), so tapping it repeatedly cannot exhaust Groq's free limits: past
 * the cap it answers with the status and the app says so.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const log = apiLogger('EMAIL_DRAFT', req)
  log.adminAction = 'email_ai_draft'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_draft', RATE_LIMITS.EMAIL_DRAFT.limit, RATE_LIMITS.EMAIL_DRAFT.window)
  if (limited) { log.summary(429); return limited }

  if (!process.env.AI_API_KEY) {
    log.summary(503)
    return NextResponse.json({ error: 'AI drafting is not set up' }, { status: 503 })
  }

  const threadId = sanitizeUUID((await props.params).id)
  if (!threadId) {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid thread id' }, { status: 400 })
  }

  try {
    log.start('DRAFT')
    const outcome = await draftForThread(threadId, { force: true })
    log.end('DRAFT')

    const { data: thread } = await createAdminClient()
      .from('email_threads')
      .select('ai_draft, ai_draft_status, ai_needs_human')
      .eq('id', threadId)
      .maybeSingle()

    log.summary(200)
    return NextResponse.json({ outcome: outcome.status, draft: thread?.ai_draft ?? null, status: thread?.ai_draft_status ?? 'none', needsHuman: thread?.ai_needs_human ?? false })
  } catch (error) {
    log.error('Failed to draft', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to write a draft' }, { status: 500 })
  }
}

/** DELETE /api/email/threads/[id]/draft  - Dismiss: the draft is dropped, nothing is sent. */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const log = apiLogger('EMAIL_DRAFT_DISMISS', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const threadId = sanitizeUUID((await props.params).id)
  if (!threadId) {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid thread id' }, { status: 400 })
  }
  try {
    const { error } = await createAdminClient()
      .from('email_threads')
      .update({ ai_draft: null, ai_draft_status: 'none', ai_needs_human: false })
      .eq('id', threadId)
    if (error) throw error
    log.summary(200)
    return NextResponse.json({ ok: true })
  } catch (error) {
    log.error('Failed to dismiss draft', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to dismiss draft' }, { status: 500 })
  }
}
