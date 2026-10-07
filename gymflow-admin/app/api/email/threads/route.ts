import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

/**
 * GET /api/email/threads?status=open|archived&cursor=<ISO time>
 *
 * The inbox list, newest activity first. `cursor` is the last_message_at of the last row
 * already shown, for loading the next page. `unreadTotal` (open threads only) feeds the
 * tab badge, so the app needs no second request to draw it.
 */
export async function GET(req: NextRequest) {
  const log = apiLogger('EMAIL_THREADS_LIST', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_threads', RATE_LIMITS.EMAIL_READ.limit, RATE_LIMITS.EMAIL_READ.window)
  if (limited) { log.summary(429); return limited }

  const status = req.nextUrl.searchParams.get('status') === 'archived' ? 'archived' : 'open'
  const cursor = req.nextUrl.searchParams.get('cursor')

  try {
    const db = createAdminClient()
    log.start('DB_QUERY')

    let query = db
      .from('email_threads')
      .select('id, subject, counterparty_email, counterparty_name, gym_id, status, snippet, last_message_at, last_direction, unread_count, gyms(name)')
      .eq('status', status)
      .order('last_message_at', { ascending: false })
      .limit(PAGE_SIZE + 1)
    if (cursor && !Number.isNaN(Date.parse(cursor))) query = query.lt('last_message_at', cursor)

    const [{ data, error }, unread] = await Promise.all([
      query,
      db.from('email_threads').select('unread_count').eq('status', 'open').gt('unread_count', 0),
    ])
    log.end('DB_QUERY')
    if (error) throw error

    const rows = data ?? []
    const hasMore = rows.length > PAGE_SIZE
    const threads = rows.slice(0, PAGE_SIZE)
    const unreadTotal = (unread.data ?? []).reduce((n, r) => n + (r.unread_count as number), 0)

    log.summary(200)
    return NextResponse.json({
      threads,
      nextCursor: hasMore ? threads[threads.length - 1].last_message_at : null,
      unreadTotal,
    })
  } catch (error) {
    log.error('Failed to list email threads', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to load inbox' }, { status: 500 })
  }
}

/**
 * DELETE /api/email/threads?status=open|archived
 *
 * "Delete all" for one list. The status is required and must match a list, so a malformed
 * request can never mean "delete everything": the app sends the tab the admin is looking at.
 */
export async function DELETE(req: NextRequest) {
  const log = apiLogger('EMAIL_THREADS_DELETE_ALL', req)
  log.adminAction = 'email_threads_delete_all'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_threads_delete_all', RATE_LIMITS.EMAIL_READ.limit, RATE_LIMITS.EMAIL_READ.window)
  if (limited) { log.summary(429); return limited }

  const status = req.nextUrl.searchParams.get('status')
  if (status !== 'open' && status !== 'archived') {
    log.summary(400)
    return NextResponse.json({ error: 'status must be open or archived' }, { status: 400 })
  }

  try {
    const { error } = await createAdminClient().from('email_threads').delete().eq('status', status)
    if (error) throw error
    log.summary(200)
    return NextResponse.json({ ok: true })
  } catch (error) {
    log.error('Failed to delete email threads', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to delete emails' }, { status: 500 })
  }
}
