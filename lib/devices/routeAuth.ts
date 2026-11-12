import 'server-only'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { apiError } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { timingSafeSecretEqual } from '@/lib/monitoring/health'
import { checkRateLimit } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import type { CommandDialect } from '@/lib/devices/commandLines'

/** A device polls for commands every few seconds; the cap only stops a runaway or hostile caller. */
const DEVICE_RPM = 120

/** Shorter than this is a placeholder or a mistake, never a real shared secret (ours are 43 characters). */
const MIN_SECRET_LENGTH = 16

/**
 * Per-instance fallback used only when the shared (Redis) limiter errors, so an outage does not remove
 * the cap entirely. Per instance, so it is looser than the real limit by design.
 */
const FALLBACK_RPM = 300
const fallbackHits = new Map<string, { minute: number; count: number }>()
function fallbackAllowed(key: string, nowMs: number = Date.now()): boolean {
  const minute = Math.floor(nowMs / 60_000)
  if (fallbackHits.size > 5000) {
    for (const [k, v] of fallbackHits) if (v.minute !== minute) fallbackHits.delete(k)
  }
  const hit = fallbackHits.get(key)
  if (!hit || hit.minute !== minute) { fallbackHits.set(key, { minute, count: 1 }); return true }
  hit.count++
  return hit.count <= FALLBACK_RPM
}

export const serialSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

type Outcome<T> =
  | { res: Response }
  | { res?: undefined; unknown: true; body: T }
  | { res?: undefined; unknown?: false; body: T; db: SupabaseClient; device: { id: string; commandDialect: CommandDialect } }

/**
 * Shared front half of the device command routes: bearer secret (same ADMS_INGEST_SECRET as the punch route,
 * placeholder values never authenticate), body validation, rate limit, and the device lookup. The gym is never
 * read from the body. A known, active device has its last_seen_at refreshed (the poll is the heartbeat).
 */
export async function authenticateDeviceRequest<T extends { serial: string }>(
  req: NextRequest, limitKey: string, schema: z.ZodType<T>,
): Promise<Outcome<T>> {
  const log = apiLogger(limitKey)
  const usable = (v: string | undefined) => (v && v.trim().length >= MIN_SECRET_LENGTH ? v.trim() : undefined)
  const secret = usable(process.env.ADMS_INGEST_SECRET)
  const previous = usable(process.env.ADMS_INGEST_SECRET_PREVIOUS)
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Both comparisons always run so timing does not reveal which secret matched.
  const okCurrent = !!secret && timingSafeSecretEqual(bearer, secret)
  const okPrevious = !!previous && timingSafeSecretEqual(bearer, previous)
  if (!okCurrent && !okPrevious) return { res: apiError(401, 'UNAUTHORIZED', 'Unauthorized') }

  let json: unknown
  try { json = await req.json() } catch { return { res: apiError(400, 'BAD_REQUEST', 'Invalid JSON') } }
  const parsed = schema.safeParse(json)
  if (!parsed.success) return { res: apiError(400, 'BAD_REQUEST', 'Invalid body') }
  const body = parsed.data
  const serial = body.serial

  try {
    const { allowed } = await checkRateLimit(serial, limitKey, DEVICE_RPM)
    if (!allowed) return { res: apiError(429, 'RATE_LIMITED', 'Rate limit exceeded') }
  } catch {
    log.warn('device rate limit check failed, using in-memory fallback', { serial })
    if (!fallbackAllowed(`${limitKey}:${serial}`)) return { res: apiError(429, 'RATE_LIMITED', 'Rate limit exceeded') }
  }

  const db = createAdminClient()
  const { data: device, error } = await db
    .from('attendance_devices').select('id, is_active, command_dialect').eq('serial_number', serial).maybeSingle()
  if (error) {
    log.error('device lookup failed', error)
    return { res: apiError(500, 'DATABASE_ERROR', 'Database error') }
  }
  if (!device || !device.is_active) return { unknown: true, body }

  const { error: seenError } = await db
    .from('attendance_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id)
  if (seenError) {
    log.error('device last_seen update failed', seenError)
    return { res: apiError(500, 'DATABASE_ERROR', 'Database error') }
  }
  return {
    body, db,
    device: { id: device.id as string, commandDialect: device.command_dialect === 'pri' ? 'pri' : 'privilege' },
  }
}
