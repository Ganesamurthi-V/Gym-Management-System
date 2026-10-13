import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/dal'
import { checkRateLimit } from '@/lib/rateLimit'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { apiLogger } from '@/lib/logger'
import { mapMemberEvents } from '@/lib/gamification/mapEvents'
import type { MemberEvent } from '@/lib/gamification/events'

/**
 * GET /api/gamification/member-events
 *
 * The signed-in member's events with progress. Same trust model as the
 * leaderboard route: no gym or member id is accepted, `get_member_events()`
 * derives the member from auth.uid(), so nothing in the request can widen the
 * result. Not `withAuth` for the same reason (it requires an OWNED gym).
 * Live data, so no cache.
 */

const ROUTE = 'GAMIFICATION_MEMBER_EVENTS_GET'
const RATE_LIMIT_PER_MINUTE = 60

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Vary', 'Cookie')
  return res
}

export async function GET() {
  const log = apiLogger(ROUTE)
  const respond = (res: NextResponse) => {
    log.summary(res.status)
    return noStore(res)
  }

  try {
    const { user } = await getAuthUser()
    if (!user) return respond(apiError(401, 'UNAUTHORIZED', 'Unauthorized'))

    // Fail open without Upstash, like the leaderboard: a read-only list should
    // not go dark because the limiter is unreachable.
    let allowed = true
    try {
      allowed = (await checkRateLimit(user.id, ROUTE, RATE_LIMIT_PER_MINUTE)).allowed
    } catch {
      allowed = true
    }
    if (!allowed) return respond(apiError(429, 'RATE_LIMITED', 'Rate limit exceeded'))

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_member_events')
    if (error) {
      log.error('get_member_events failed', error)
      return respond(apiError(500, 'EVENTS_FAILED', 'Could not load events'))
    }

    const events: MemberEvent[] = mapMemberEvents(data)
    return respond(apiSuccess({ events }))
  } catch (err) {
    log.error(`Unhandled exception in ${ROUTE}`, err)
    return respond(apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred'))
  }
}
