import { NextRequest } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { timingSafeSecretEqual } from '@/lib/monitoring/health'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { logger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { istToday } from '@/lib/gamification/periods'
import { isPushConfigured } from '@/lib/push/config'
import { capAndPublish, loadSubscribersByGym } from '@/lib/push/daily'
import { PUSH_COPY } from '@/lib/push/payload'
import { seedOf, type DuePush } from '@/lib/push/rules'
import { dayNumber } from '@/lib/progress/chart'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const IST_MS = 5.5 * 3600_000
/** Minutes of the IST day: this nudge only goes out 17:00 to 20:30. */
const WINDOW_START = 17 * 60
const WINDOW_END = 20 * 60 + 30

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

/**
 * POST /api/cron/push-evening  (QStash schedule ~19:00 IST, see lib/push/README.md).
 * Streak-at-risk nudge: members with a live streak of 2+ days who have not checked in today (IST).
 * Off unless PUSH_EVENING_ENABLED=true.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text().catch(() => '')
  if (!(await isAuthorized(req, rawBody))) return apiError(401, 'FORBIDDEN', 'Unauthorized')
  if (process.env.PUSH_EVENING_ENABLED !== 'true' || !isPushConfigured()) return apiSuccess({ skipped: true })

  const now = new Date()
  const ist = new Date(now.getTime() + IST_MS)
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  if (minutes < WINDOW_START || minutes > WINDOW_END) return apiSuccess({ skipped: true, reason: 'outside_window' })

  let considered = 0
  let queued = 0
  try {
    const db = createAdminClient()
    const today = istToday(now)
    const subscribers = await loadSubscribersByGym(db)
    for (const gymId of subscribers.keys()) {
      try {
        // The gym id comes from our own subscriptions table, never from the request.
        const { data, error } = await db.rpc('members_streak_at_risk', { p_gym_id: gymId })
        if (error) throw new Error(error.message)
        const subscribed = new Set(subscribers.get(gymId))
        const candidates: DuePush[] = ((data ?? []) as Array<{ member_id: string }>)
          .filter(r => subscribed.has(r.member_id))
          .map(r => ({
            memberId: r.member_id, kind: 'streak_risk' as const, ref: today,
            body: PUSH_COPY.streakRisk(seedOf(r.member_id) + dayNumber(today)), url: '/m/attendance',
          }))
        considered += candidates.length
        queued += await capAndPublish(gymId, candidates, now)
      } catch (err) {
        logger.error('push_evening_gym_failed', { gymId, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } catch (err) {
    logger.error('push_evening_failed', { error: err instanceof Error ? err.message : String(err) })
    return apiError(500, 'SERVER_ERROR', 'Internal error')
  }
  return apiSuccess({ considered, queued })
}
