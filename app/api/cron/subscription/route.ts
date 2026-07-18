/**
 * POST /api/cron/subscription
 *
 * Daily cron: marks gyms whose trial or paid subscription has lapsed as
 * `subscription_status = 'expired'`.
 *
 * No cache invalidation is needed — subscription fields are no longer cached.
 * getGymSubscription() always fetches a fresh row from Postgres, so the DB
 * write here is immediately visible on the next page render.
 *
 * Security: x-cron-secret header or Bearer token (same as /api/cron/whatsapp).
 * Vercel Cron triggers this via the schedule in vercel.json.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') ?? ''
  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  const bearer     = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!cronSecret || (bearer !== cronSecret && cronHeader !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // ── 1. Expire lapsed trials ───────────────────────────────────────────────
  const { data: expiredTrials, error: trialsError } = await supabase
    .from('gyms')
    .update({ subscription_status: 'expired' })
    .eq('subscription_status', 'trial')
    .lt('trial_ends_at', now)
    .select('id')

  if (trialsError) {
    console.error('[Cron/Sub] Failed to expire trials:', trialsError)
    return NextResponse.json({ error: trialsError.message }, { status: 500 })
  }

  // ── 2. Expire lapsed paid subscriptions ───────────────────────────────────
  // Lifetime plans store subscription_ends_at = NULL so .lt() never matches them.
  const { data: expiredSubs, error: subsError } = await supabase
    .from('gyms')
    .update({ subscription_status: 'expired' })
    .eq('subscription_status', 'active')
    .lt('subscription_ends_at', now)
    .select('id')

  if (subsError) {
    console.error('[Cron/Sub] Failed to expire subscriptions:', subsError)
    return NextResponse.json({ error: subsError.message }, { status: 500 })
  }

  const trials = expiredTrials?.length ?? 0
  const subs   = expiredSubs?.length ?? 0
  console.log(`[Cron/Sub] Expired ${trials} trial(s), ${subs} subscription(s).`)

  return NextResponse.json({ expired: trials + subs, trials, subscriptions: subs })
}

// Allow GET for Vercel's cron ping
export async function GET(req: NextRequest) {
  return POST(req)
}
