import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeTicketResolution } from '@/lib/sanitize'
import { apiLogger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const log = apiLogger('ADMIN_TICKETS_LIST', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'tickets_list', RATE_LIMITS.TICKET_LIST.limit, RATE_LIMITS.TICKET_LIST.window)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  try {
    log.start('DB_QUERY')
    const supabase = createAdminClient()
    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select('*, gyms(name, owner_id)')
      .eq('is_cleared_by_admin', false)
      .order('created_at', { ascending: false })
    log.end('DB_QUERY')

    if (error) throw error

    log.summary(200)
    return NextResponse.json(tickets)
  } catch (error: unknown) {
    log.error('Failed to fetch tickets', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const log = apiLogger('ADMIN_TICKETS_RESOLVE', req)
  log.adminAction = 'resolve_ticket'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'ticket_resolve', RATE_LIMITS.TICKET_RESOLVE.limit, RATE_LIMITS.TICKET_RESOLVE.window)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  try {
    const rawBody = await req.json()

    const sanitized = sanitizeTicketResolution(rawBody)
    if ('error' in sanitized) {
      log.warn('Invalid ticket resolution input', { error: sanitized.error })
      log.summary(400)
      return NextResponse.json({ error: sanitized.error }, { status: 400 })
    }

    const { ticketId, status, replySubject, replyMessage } = sanitized

    log.start('DB_FETCH_TICKET')
    const supabase = createAdminClient()
    const { data: ticket, error: fetchErr } = await supabase
      .from('support_tickets')
      .select('gym_id, status')
      .eq('id', ticketId)
      .single()
    log.end('DB_FETCH_TICKET')

    if (fetchErr || !ticket) {
      log.warn('Ticket not found for resolution', { ticketId })
      log.summary(404)
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.status === 'resolved') {
      log.warn('Attempt to resolve already-resolved ticket', { ticketId })
      log.summary(400)
      return NextResponse.json({ error: 'Ticket already resolved' }, { status: 400 })
    }

    log.start('DB_UPDATE_TICKET')
    const { error } = await supabase
      .from('support_tickets')
      .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
      .eq('id', ticketId)
    log.end('DB_UPDATE_TICKET')

    if (error) throw error

    log.start('DB_INSERT_REPLY')
    const { error: msgError } = await supabase
      .from('admin_messages')
      .insert({ gym_id: ticket.gym_id, subject: replySubject, body: replyMessage, type: 'success', sent_by: 'super_admin' })
    log.end('DB_INSERT_REPLY')

    if (msgError) {
      log.warn('Failed to send reply message after resolving ticket', { ticketId })
    }

    // Broadcast minimal notification to the client
    try {
      log.start('REALTIME_BROADCAST')
      await supabase.channel(`gym_support_realtime_${ticket.gym_id}`).send({
        type: 'broadcast',
        event: 'ticket_update',
        payload: { id: ticketId, status, gym_id: ticket.gym_id, timestamp: new Date().toISOString() }
      })
      log.end('REALTIME_BROADCAST')
    } catch (err) {
      log.warn('Failed to broadcast realtime event', { error: String(err) })
    }

    log.info('Ticket resolved', { ticketId })
    log.summary(200)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    log.error('Failed to resolve ticket', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to resolve ticket' }, { status: 500 })
  }
}
