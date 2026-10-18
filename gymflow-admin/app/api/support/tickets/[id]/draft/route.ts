import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { draftTicketReply } from '@/lib/ai-ticket-draft'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STATUS = { limit: 429, busy: 503, unavailable: 503, bad_output: 502 } as const

/**
 * POST /api/support/tickets/[id]/draft  - the "AI draft" button on the resolve form.
 *
 * Returns a suggested reply for the admin to edit. Nothing is sent or stored. The ticket
 * text is read from the database by id, never from the request body, so the endpoint cannot
 * be used as a free-form AI prompt.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const log = apiLogger('ADMIN_TICKET_DRAFT', req)
  log.adminAction = 'ticket_ai_draft'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'ticket_draft', RATE_LIMITS.TICKET_DRAFT.limit, RATE_LIMITS.TICKET_DRAFT.window)
  if (limited) { log.summary(429); return limited }

  if (!process.env.AI_API_KEY) {
    log.summary(503)
    return NextResponse.json({ error: 'AI drafting is not set up' }, { status: 503 })
  }

  const ticketId = sanitizeUUID((await props.params).id)
  if (!ticketId) {
    log.summary(400)
    return NextResponse.json({ error: 'Invalid ticket id' }, { status: 400 })
  }

  try {
    log.start('DB_FETCH_TICKET')
    const { data: ticket, error } = await createAdminClient()
      .from('support_tickets')
      .select('subject, message, type, rating, gyms(name)')
      .eq('id', ticketId)
      .maybeSingle()
    log.end('DB_FETCH_TICKET')
    if (error) throw error
    if (!ticket) {
      log.summary(404)
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const gym = ticket.gyms as { name?: string } | { name?: string }[] | null
    const gymName = (Array.isArray(gym) ? gym[0]?.name : gym?.name) ?? null

    log.start('DRAFT')
    const result = await draftTicketReply({
      type: ticket.type as string,
      subject: ticket.subject as string,
      message: ticket.message as string,
      rating: (ticket.rating as number | null) ?? null,
      ownerName: null, // gyms store no owner name; the prompt greets "Hi there"
      gymName,
    })
    log.end('DRAFT')

    if (!result.ok) {
      const status = STATUS[result.reason]
      log.warn('Ticket draft not produced', { reason: result.reason })
      log.summary(status)
      return NextResponse.json({ error: result.message }, { status })
    }

    log.info('Ticket draft written', { model: result.model, needsHuman: result.needsHuman })
    log.summary(200)
    return NextResponse.json({ subject: result.subject, body: result.body, needsHuman: result.needsHuman })
  } catch (error) {
    log.error('Failed to draft ticket reply', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to write a draft' }, { status: 500 })
  }
}
