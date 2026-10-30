import { NextRequest } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { z } from 'zod'
import { timingSafeSecretEqual } from '@/lib/monitoring/health'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { logger } from '@/lib/logger'
import { isPushConfigured } from '@/lib/push/config'
import { sendPushToMembers } from '@/lib/push/send'
import { publishPushJob } from '@/lib/push/publish'
import type { PushJob } from '@/types/push'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // above the 40 s send budget plus the re-publish

const uuid = z.string().uuid()
const jobSchema = z.object({
  gymId: uuid,
  kind: z.enum(['notice', 'payment_decision', 'expiring', 'weigh_in', 'measurements', 'goal', 'miss_you', 'weekly_quote', 'streak_risk']),
  ref: z.string().min(1).max(200),
  memberIds: z.array(uuid).max(5000).optional(),
  body: z.string().min(1).max(500),
  url: z.string().max(300),
  tag: z.string().max(100).optional(),
  cursor: uuid.optional(),
})

/** Verify the request came from QStash (signed) or carries the CRON_SECRET. */
async function isAuthorized(req: NextRequest, rawBody: string): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  if (cronSecret && timingSafeSecretEqual(headerSecret, cronSecret)) return true

  const signature = req.headers.get('upstash-signature')
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY
  if (signature && currentKey && nextKey) {
    try {
      await new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey }).verify({ signature, body: rawBody })
      return true
    } catch {
      return false
    }
  }
  return false
}

/** POST /api/push/send  body: PushJob. Called by QStash (or manually with x-cron-secret). */
export async function POST(req: NextRequest) {
  // Raw body once: the QStash signature covers the exact bytes.
  const rawBody = await req.text().catch(() => '')
  if (!(await isAuthorized(req, rawBody))) return apiError(401, 'FORBIDDEN', 'Unauthorized')
  if (!isPushConfigured()) return apiSuccess({ sent: 0, removed: 0, failed: 0, skipped: 'not_configured' })

  let json: unknown
  try { json = JSON.parse(rawBody) } catch { return apiError(400, 'VALIDATION_ERROR', 'Invalid JSON') }
  const parsed = jobSchema.safeParse(json)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', 'Invalid push job')
  const job: PushJob = parsed.data

  try {
    const result = await sendPushToMembers(job)
    if (result.nextCursor) await publishPushJob({ ...job, cursor: result.nextCursor })
    return apiSuccess({ sent: result.sent, removed: result.removed, failed: result.failed, more: !!result.nextCursor })
  } catch (err) {
    logger.error('push_send_route_failed', { error: err instanceof Error ? err.message : String(err) })
    return apiError(500, 'SERVER_ERROR', 'Internal error')
  }
}
