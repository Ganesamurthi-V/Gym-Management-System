import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { passesCsrf } from '@/app/api/_guard'
import { recordOwnerAction } from '@/lib/activity/record'

export async function POST(req: NextRequest) {
  const log = apiLogger('SUPPORT_TICKET')
  try {
    if (!passesCsrf(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { allowed } = await checkRateLimit(user.id, 'support_ticket', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const type = body?.type
    const message: string = (body?.message ?? '').toString().trim()

    const ALLOWED_TYPES = ['query', 'issue', 'bug', 'high_priority', 'feedback']
    if (!type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 })
    }

    const isFeedback = type === 'feedback'

    // Feedback carries a 1-5 star rating and needs no subject from the user — we
    // derive one below. Support tickets require a subject and a message.
    let rating: number | null = null
    if (isFeedback) {
      const raw = Number(body?.rating)
      if (!Number.isInteger(raw) || raw < 1 || raw > 5) {
        return NextResponse.json({ error: 'Please choose a rating from 1 to 5' }, { status: 400 })
      }
      rating = raw
      // A comment is optional on feedback, but we must store something non-empty in
      // the NOT NULL message column, so fall back to the rating summary.
      if (!message && rating === null) {
        return NextResponse.json({ error: 'Missing feedback' }, { status: 400 })
      }
    }

    const subject: string = isFeedback
      ? // Derive a readable subject: the category chip (sent as `subject`) or a
        // generic label, so the admin list shows something meaningful.
        (body?.subject?.toString().trim() || `Feedback — ${rating}/5`)
      : (body?.subject ?? '').toString().trim()

    if (!isFeedback && (!subject || !message)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Unbounded text would let one request store megabytes per ticket.
    if (subject.length > 200 || message.length > 5000) {
      return NextResponse.json({ error: 'Subject or message is too long' }, { status: 400 })
    }

    // Get the gym_id for this user
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!gym) {
      return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
    }

    // Insert the ticket / feedback row. Feedback stores its rating and, when the
    // owner left no comment, a short stand-in message so the NOT NULL column holds.
    const { error: insertError } = await supabase
      .from('support_tickets')
      .insert({
        gym_id: gym.id,
        subject,
        message: message || (isFeedback ? `Rated ${rating}/5` : message),
        type,
        rating,
        status: 'open'
      })

    if (insertError) throw insertError

    recordOwnerAction(supabase, req, 'SUPPORT_TICKET')
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    log.error('Unhandled exception in POST /api/support/ticket', error)
    return NextResponse.json({ error: 'Failed to submit ticket' }, { status: 500 })
  }
}
