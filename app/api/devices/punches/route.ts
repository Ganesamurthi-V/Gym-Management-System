import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { timingSafeSecretEqual } from '@/lib/monitoring/health'
import { checkRateLimit } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { ingestPunches } from '@/lib/devices/processPunch'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { todayIST } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/** One device pushes a few times a minute at most; the cap only stops a runaway or hostile caller. */
const DEVICE_RPM = 120

/** Shorter than this is a placeholder or a mistake, never a real shared secret (ours are 43 characters). */
const MIN_SECRET_LENGTH = 16

/**
 * Per-instance fallback used only when the shared (Redis) limiter errors, so an outage does not remove
 * the cap entirely. Per instance, so it is looser than the real limit by design.
 */
const FALLBACK_RPM = 300
const fallbackHits = new Map<string, { minute: number; count: number }>()
function fallbackAllowed(serial: string, nowMs: number = Date.now()): boolean {
  const minute = Math.floor(nowMs / 60_000)
  if (fallbackHits.size > 5000) {
    for (const [k, v] of fallbackHits) if (v.minute !== minute) fallbackHits.delete(k)
  }
  const hit = fallbackHits.get(serial)
  if (!hit || hit.minute !== minute) { fallbackHits.set(serial, { minute, count: 1 }); return true }
  hit.count++
  return hit.count <= FALLBACK_RPM
}

const bodySchema = z.object({
  serial: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  punches: z.array(z.object({
    pin: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
    time: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    status: z.number().int().nullable().optional(),
    verify: z.number().int().nullable().optional(),
  })).max(500),
})

/**
 * POST /api/devices/punches
 *
 * Called only by the ADMS receiver service (gymflow-adms), authenticated by a shared bearer secret since
 * there is no user session. The gym always comes from the attendance_devices row for the serial, never
 * from the body. A 5xx makes the receiver answer the device with an error so it retries the batch.
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('DEVICE_PUNCHES')
  // A secret that is blank, whitespace or too short counts as NOT SET. SST needs a placeholder value (a single
  // space) for an unused secret, and that placeholder must never authenticate anyone.
  const usable = (v: string | undefined) => (v && v.trim().length >= MIN_SECRET_LENGTH ? v.trim() : undefined)
  const secret = usable(process.env.ADMS_INGEST_SECRET)
  // Optional: the previous secret stays valid during a rotation. Unset or placeholder means ignored.
  const previous = usable(process.env.ADMS_INGEST_SECRET_PREVIOUS)
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Both comparisons always run so timing does not reveal which secret matched.
  const okCurrent = !!secret && timingSafeSecretEqual(bearer, secret)
  const okPrevious = !!previous && timingSafeSecretEqual(bearer, previous)
  if (!okCurrent && !okPrevious) {
    return apiError(401, 'UNAUTHORIZED', 'Unauthorized')
  }

  let json: unknown
  try { json = await req.json() } catch { return apiError(400, 'BAD_REQUEST', 'Invalid JSON') }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return apiError(400, 'BAD_REQUEST', 'Invalid body')
  const { serial, punches } = parsed.data

  try {
    const { allowed } = await checkRateLimit(serial, 'DEVICE_PUNCHES', DEVICE_RPM)
    if (!allowed) return apiError(429, 'RATE_LIMITED', 'Rate limit exceeded')
  } catch {
    // Redis down must not drop punches (the ingest is idempotent), but do not go unlimited either.
    log.warn('device rate limit check failed, using in-memory fallback', { serial })
    if (!fallbackAllowed(serial)) return apiError(429, 'RATE_LIMITED', 'Rate limit exceeded')
  }

  const db = createAdminClient()
  const { data: device, error: deviceError } = await db
    .from('attendance_devices').select('id, gym_id, timezone, is_active').eq('serial_number', serial).maybeSingle()
  if (deviceError) {
    log.error('device lookup failed', deviceError)
    return apiError(500, 'DATABASE_ERROR', 'Database error')
  }
  if (!device || !device.is_active) return apiSuccess({ known: false, accepted: 0 })

  const { error: seenError } = await db
    .from('attendance_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id)
  if (seenError) {
    log.error('device last_seen update failed', seenError)
    return apiError(500, 'DATABASE_ERROR', 'Database error')
  }

  if (punches.length === 0) return apiSuccess({ known: true, accepted: 0 })

  const { accepted, failed } = await ingestPunches(db, device, punches)
  log.info('device punches processed', { serial, received: punches.length, accepted, failed })
  if (failed) return apiError(500, 'DATABASE_ERROR', 'Database error')
  // Same as the kiosk check-in: the dashboard caches today's attendance count, so drop it or device punches show late.
  if (accepted > 0) await deleteCache(cacheKeys.dashboard(device.gym_id, todayIST()))
  return apiSuccess({ known: true, accepted })
}
