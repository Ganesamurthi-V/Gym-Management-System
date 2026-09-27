import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

/**
 * GET /api/notifications
 * Returns the most recent admin notifications plus an unread count. Consumed by
 * both the admin web (future) and the admin mobile notification centre. Reads
 * through the service-role client, which bypasses the RLS-deny on the table.
 */
export async function GET(req: NextRequest) {
  const log = apiLogger('ADMIN_NOTIFICATIONS_LIST', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'notifications_list', RATE_LIMITS.TICKET_LIST.limit, RATE_LIMITS.TICKET_LIST.window)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  try {
    log.start('DB_QUERY')
    const supabase = createAdminClient()

    // Cap the feed; the mobile centre paginates by "load more" later if needed.
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    const { count, error: countError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
    log.end('DB_QUERY')

    if (countError) throw countError

    log.summary(200)
    return NextResponse.json({ notifications: notifications ?? [], unread: count ?? 0 })
  } catch (error: unknown) {
    log.error('Failed to fetch notifications', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

/**
 * PATCH /api/notifications
 * Marks a single notification read ({ id }) or all of them ({ all: true }).
 */
export async function PATCH(req: NextRequest) {
  const log = apiLogger('ADMIN_NOTIFICATIONS_READ', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'notifications_read', RATE_LIMITS.TICKET_RESOLVE.limit, RATE_LIMITS.TICKET_RESOLVE.window)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  try {
    const body = await req.json().catch(() => null) as { id?: string; all?: boolean } | null
    if (!body || (!body.id && !body.all)) {
      log.summary(400)
      return NextResponse.json({ error: 'Provide an id or all=true' }, { status: 400 })
    }

    const supabase = createAdminClient()
    let query = supabase.from('notifications').update({ is_read: true })

    if (body.all) {
      // A no-op filter that matches every row; Supabase requires a filter on update.
      query = query.eq('is_read', false)
    } else {
      query = query.eq('id', body.id as string)
    }

    const { error } = await query
    if (error) throw error

    log.summary(200)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    log.error('Failed to mark notifications read', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
