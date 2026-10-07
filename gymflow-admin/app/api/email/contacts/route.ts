import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getSupportMailbox } from '@/lib/email'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const MAX_RESULTS = 20

/**
 * GET /api/email/contacts?q=<text>
 *
 * Suggestions for the "To" field of a new message: people who have emailed support, then gym
 * owners (found by gym name, owner name or email, so any customer is reachable even if they
 * never wrote in). One entry per address, correspondents first. An address that is in neither
 * list can still be typed in the app; the compose route accepts any valid address.
 */
export async function GET(req: NextRequest) {
  const log = apiLogger('EMAIL_CONTACTS', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limited = await rateLimit(req, 'email_contacts', RATE_LIMITS.EMAIL_READ.limit, RATE_LIMITS.EMAIL_READ.window)
  if (limited) { log.summary(429); return limited }

  // Characters that are syntax in a PostgREST filter, or wildcards in ILIKE, are dropped.
  const q = (req.nextUrl.searchParams.get('q') ?? '').replace(/[,()%*_\\"']/g, ' ').trim().slice(0, 60)

  try {
    const db = createAdminClient()
    log.start('DB_QUERY')
    let query = db
      .from('email_threads')
      .select('counterparty_email, counterparty_name, last_message_at, gyms(name)')
      .order('last_message_at', { ascending: false })
      .limit(400)
    if (q) query = query.or(`counterparty_email.ilike.%${q}%,counterparty_name.ilike.%${q}%`)
    const { data, error } = await query
    log.end('DB_QUERY')
    if (error) throw error

    const own = getSupportMailbox().address
    const seen = new Map<string, { email: string; name: string | null; gymName: string | null; lastAt: string; source: 'mail' | 'gym' }>()
    for (const row of data ?? []) {
      const email = (row.counterparty_email as string).toLowerCase()
      if (email === own) continue
      const gym = (Array.isArray(row.gyms) ? row.gyms[0] : row.gyms) as { name?: string } | null
      const existing = seen.get(email)
      if (!existing) {
        seen.set(email, {
          email,
          name: (row.counterparty_name as string | null) || null,
          gymName: gym?.name ?? null,
          lastAt: row.last_message_at as string,
          source: 'mail',
        })
      } else {
        // Rows run newest first: fill in a name or gym the newest thread did not have.
        existing.name ??= (row.counterparty_name as string | null) || null
        existing.gymName ??= gym?.name ?? null
      }
    }

    // Gym owners. If the search function has not been installed yet (migration not run), or
    // fails, the list simply stays mail-only rather than failing the whole request.
    try {
      const { data: owners } = await db.rpc('search_gym_owner_contacts', { p_q: q, p_limit: MAX_RESULTS })
      for (const o of (owners ?? []) as { email: string; owner_name: string | null; gym_name: string | null }[]) {
        const email = o.email.toLowerCase()
        if (email === own) continue
        const existing = seen.get(email)
        if (existing) {
          existing.name ??= o.owner_name
          existing.gymName ??= o.gym_name
        } else {
          seen.set(email, { email, name: o.owner_name, gymName: o.gym_name, lastAt: '', source: 'gym' })
        }
      }
    } catch {
      /* mail contacts only */
    }

    log.summary(200)
    return NextResponse.json({ contacts: [...seen.values()].slice(0, MAX_RESULTS) })
  } catch (error) {
    log.error('Failed to search contacts', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 })
  }
}
