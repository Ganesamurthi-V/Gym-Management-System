import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * owner_id -> email, cached briefly in module scope (so, per warm lambda).
 *
 * `auth.admin.listUsers({ perPage: 1000 })` was being called on every single list
 * request purely to attach an email to each row. The gym list is the admin mobile
 * app's most-visited screen and it refetches on focus, so that heavy call was being
 * repeated constantly for data that changes rarely — a new owner appears when a gym
 * is created, not between two taps.
 *
 * A short TTL keeps it honest: a newly registered owner shows up within seconds,
 * and in the meantime the fallback is a harmless 'Unknown Email' rather than wrong
 * data. Kept deliberately small so a long-lived lambda cannot serve stale emails.
 */
let ownerCache: { at: number; map: Map<string, string> } | null = null
const OWNER_TTL_MS = 30_000

async function getOwnerEmails(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string>> {
  if (ownerCache && Date.now() - ownerCache.at < OWNER_TTL_MS) return ownerCache.map

  try {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const map = new Map<string, string>()
    for (const u of data?.users ?? []) {
      if (u.id && u.email) map.set(u.id, u.email)
    }
    ownerCache = { at: Date.now(), map }
    return map
  } catch {
    // Prefer stale emails over failing the whole gym list for a cosmetic field.
    return ownerCache?.map ?? new Map()
  }
}

// GET /api/gyms — list all gyms with owner info and stats
export async function GET(req: NextRequest) {
  // Security fix: Verify authentication
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Security fix: Rate limiting
  const rateLimitResponse = await rateLimit(
    req,
    'gyms_list',
    RATE_LIMITS.GYM_LIST.limit,
    RATE_LIMITS.GYM_LIST.window
  )
  if (rateLimitResponse) return rateLimitResponse

  try {
    const supabase = createAdminClient()

    const { data: gyms, error } = await supabase
      .from('gyms')
      .select(`
        id, name, created_at, owner_id, is_active,
        members ( count ),
        memberships ( count )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Owner emails live in auth.users, which needs a separate admin call. That call
    // is the expensive part of this handler — it pulls up to 1000 user records just
    // to resolve a name per row — so it is cached briefly and shared across requests
    // rather than repeated on every list load. See getOwnerEmails.
    const ownerEmails = await getOwnerEmails(supabase)

    const gymsWithOwners = gyms.map(gym => ({
      ...gym,
      // Map lookup rather than users.find() inside the map, which was O(gyms x users).
      owner: { email: ownerEmails.get(gym.owner_id) ?? 'Unknown Email' },
    }))

    return NextResponse.json(gymsWithOwners)
  } catch (error: any) {
    console.error('Gyms fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch gyms' }, { status: 500 })
  }
}
