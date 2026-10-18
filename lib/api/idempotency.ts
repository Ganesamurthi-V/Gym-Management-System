import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/redis'

/**
 * Double-submit guard for money writes. Owners on slow 4G tap twice; the second
 * request carries the same `Idempotency-Key` header (one UUID per form
 * submission), and an atomic `SET NX EX` lets only the first one through.
 *
 * Missing header: allowed (old clients keep working). Redis not configured:
 * skipped, logged once. The key is scoped by the server-resolved gym id and
 * route so a client cannot collide with, or probe, another tenant's keys.
 */
const TTL_SECONDS = 600
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let warnedNoRedis = false

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

/** Returns a response to send back (duplicate / bad key), or null to proceed. */
export async function claimIdempotencyKey(
  req: NextRequest,
  gymId: string,
  route: string,
): Promise<NextResponse | null> {
  const key = req.headers.get('idempotency-key')
  if (!key) return null
  if (!UUID_RE.test(key)) {
    return fail(400, 'INVALID_IDEMPOTENCY_KEY', 'Invalid request key. Please reload and try again.')
  }

  const redis = getRedisClient()
  if (!redis) {
    if (!warnedNoRedis) {
      warnedNoRedis = true
      console.warn('[idempotency] Redis not configured; duplicate-submit protection disabled')
    }
    return null
  }

  try {
    const claimed = await redis.set(`idem:${gymId}:${route}:${key.toLowerCase()}`, '1', {
      nx: true,
      ex: TTL_SECONDS,
    })
    if (claimed === null) {
      return fail(409, 'DUPLICATE_REQUEST', 'This was already saved.')
    }
  } catch (err) {
    // Redis outage must not block recording a payment; the guard is best-effort.
    console.error('[idempotency] Redis error, proceeding without guard:', err)
  }
  return null
}
