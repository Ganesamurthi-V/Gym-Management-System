/**
 * POST /api/cron/subscription
 *
 * Daily cron: marks gyms whose trial has expired as `subscription_status = 'expired'`.
 * Invalidates the Redis gym cache for each affected owner so the next request
 * gets a fresh gym row (with the updated status).
 *
 * Security: same pattern as /api/cron/whatsapp — x-cron-secret or Bearer token.
 * Vercel Cron triggers this via the schedule in vercel.json.
 *
 * Manual trigger:
 *   POST /api/cron/subscription
 *   Header: x-cron-secret: <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret  = process.env.CRON_SECRET
  const authHeader  = req.headers.get('authorization') ?? ''
  const cronHeader  = req.headers.get('x-cron-secret') ?? ''
  const bearer      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!cronSecret || (bearer !== cronSecret && cronHeader !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Expire all trials that have run out of time
  const { data, error } = await supabase
    .from('gyms')
    .update({ subscription_status: 'expired' })
    .eq('subscription_status', 'trial')
    .lt('trial_ends_at', new Date().toISOString())
    .select('id, owner_id')

  if (error) {
    console.error('[Cron/Sub] Failed to expire trials:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Invalidate Redis cache for each affected gym owner
  const { deleteCache } = await import('@/lib/cache')
  const affectedGyms = data ?? []

  await Promise.all(
    affectedGyms.map(gym => deleteCache(`user:${gym.owner_id}:gym`))
  )

  console.log(`[Cron/Sub] Expired ${affectedGyms.length} trial(s)`)
  return NextResponse.json({ expired: affectedGyms.length })
}

// Allow GET for Vercel's cron ping
export async function GET(req: NextRequest) {
  return POST(req)
}
