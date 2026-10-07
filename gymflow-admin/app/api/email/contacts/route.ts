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
 * The people the admin may write a new email to: everyone who has already emailed the
 * support address, one entry per address, most recently active first. `q` filters by name or
 * address. Only people who wrote to us appear here, so the compose screen cannot be used to
 * mail strangers from the support address (the compose route enforces the same rule).
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
    const seen = new Map<string, { email: string; name: string | null; gymName: string | null; lastAt: string }>()
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
        })
      } else {
        // Rows run newest first: fill in a name or gym the newest thread did not have.
        existing.name ??= (row.counterparty_name as string | null) || null
        existing.gymName ??= gym?.name ?? null
      }
    }

    log.summary(200)
    return NextResponse.json({ contacts: [...seen.values()].slice(0, MAX_RESULTS) })
  } catch (error) {
    log.error('Failed to search contacts', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 })
  }
}
