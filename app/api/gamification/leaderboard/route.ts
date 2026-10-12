import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/dal'
import { roleFromClaims } from '@/lib/auth/roles'
import { checkRateLimit } from '@/lib/rateLimit'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { apiLogger } from '@/lib/logger'
import {
  DEFAULT_LEADERBOARD_LIMIT,
  LEADERBOARD_BOARDS,
  MAX_LEADERBOARD_LIMIT,
} from '@/lib/gamification/constants'
import { leaderboardRpcArgs, mapLeaderboard } from '@/lib/gamification/mapLeaderboard'
import type { LeaderboardApiData } from '@/lib/gamification/leaderboardDisplay'

/**
 * GET /api/gamification/leaderboard?board=week|month|streak|all&limit=1..200
 *
 * The live board behind `useLeaderboard`, polled every ~20 s by BOTH the member
 * leaderboard (`/m/leaderboard`) and the owner preview (`/owner/member-app`).
 *
 * WHY NOT `withAuth`
 * `withAuth` resolves the caller's OWNED gym and answers 404 when there is none,
 * so a member could never get through it. This route needs no gym at all: the
 * `get_gym_leaderboard` RPC derives the tenant from `auth.uid()` (owner -> their
 * gym with full names, member -> their own gym with masked names) and takes no
 * gym or member id. So the route only has to prove "someone is signed in", and
 * nothing in the query string can widen what the RPC returns.
 *
 * AUTH
 * `getAuthUser()` verifies the JWT signature locally (`getClaims()`, ~1 ms).
 * `withAuth` uses `getUser()`, a ~400 ms network call, which a 20 s poll should
 * not pay. PostgREST re-verifies the same token when the RPC runs, and the RPC
 * returns nothing for a caller who is neither an owner nor a linked member.
 *
 * No CSRF check: GET is read-only. No Redis cache: the board must be live.
 */

const ROUTE = 'GAMIFICATION_LEADERBOARD_GET'

/**
 * Per user, per minute. One open board polls 3 times a minute; the rest is
 * headroom for switching tabs and refocusing the app, each of which refetches.
 */
const RATE_LIMIT_PER_MINUTE = 60

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const

const querySchema = z.object({
  board: z.enum(LEADERBOARD_BOARDS).default('week'),
  limit: z.coerce.number().int().min(1).max(MAX_LEADERBOARD_LIMIT).default(DEFAULT_LEADERBOARD_LIMIT),
})

/** `apiSuccess` / `apiError` send `private, no-store`; the contract here is plain `no-store`. */
function noStore(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(NO_STORE)) res.headers.set(key, value)
  return res
}

export async function GET(req: NextRequest) {
  const log = apiLogger(ROUTE)
  const respond = (res: NextResponse) => {
    log.summary(res.status)
    return noStore(res)
  }

  try {
    const { user } = await getAuthUser()
    if (!user) return respond(apiError(401, 'UNAUTHORIZED', 'Unauthorized'))

    const params = req.nextUrl.searchParams
    const parsed = querySchema.safeParse({
      board: params.get('board') ?? undefined,
      limit: params.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return respond(apiError(400, 'VALIDATION_ERROR', 'Invalid board or limit'))
    }
    const { board, limit } = parsed.data

    // Fail open: without Upstash (local dev, or an outage) the limiter throws,
    // and a read-only board should keep working rather than go dark.
    let allowed = true
    try {
      allowed = (await checkRateLimit(user.id, ROUTE, RATE_LIMIT_PER_MINUTE)).allowed
    } catch {
      allowed = true
    }
    if (!allowed) return respond(apiError(429, 'RATE_LIMITED', 'Rate limit exceeded'))

    const supabase = await createClient()
    const isMember = roleFromClaims(user) === 'member'

    // The RPC returns zero rows both for "nobody has checked in" and for "this
    // gym switched leaderboards off", so `enabled` needs its own signal:
    //  - member: an enabled board ALWAYS contains the caller's own row, so no
    //    rows means disabled (or not a linked member, which reads the same).
    //  - owner: the RPC ignores the switch for owners, so read the setting.
    //    RLS limits this table to the owner's own gym; a missing row means the
    //    defaults, i.e. enabled. Run in parallel so it adds no latency.
    const [boardRes, settingsRes] = await Promise.all([
      supabase.rpc('get_gym_leaderboard', leaderboardRpcArgs(board, limit)),
      isMember
        ? Promise.resolve({ data: null })
        : supabase.from('gym_gamification_settings').select('leaderboards_enabled').limit(1).maybeSingle(),
    ])

    if (boardRes.error) {
      log.error('get_gym_leaderboard failed', boardRes.error)
      return respond(apiError(500, 'LEADERBOARD_FAILED', 'Could not load the leaderboard'))
    }

    const rows = mapLeaderboard(boardRes.data)
    const settings = settingsRes.data as { leaderboards_enabled?: boolean } | null
    const enabled = isMember ? rows.length > 0 : settings?.leaderboards_enabled !== false

    const data: LeaderboardApiData = {
      board,
      rows,
      totalMembers: rows[0]?.totalMembers ?? 0,
      enabled,
    }
    return respond(apiSuccess(data))
  } catch (err) {
    log.error(`Unhandled exception in ${ROUTE}`, err)
    return respond(apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred'))
  }
}
