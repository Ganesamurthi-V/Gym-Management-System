/**
 * POST /api/cron/subscription
 *
 * Daily cron job with two responsibilities:
 *
 * 1. EXPIRE: marks gyms whose trial/subscription has lapsed as `expired` and
 *    invalidates their Redis cache so the next request gets a fresh row.
 *
 * 2. EXPIRING SOON: invalidates the Redis cache for gyms whose paid subscription
 *    will expire within EXPIRING_SOON_DAYS. No DB write is needed here —
 *    `computeSubscriptionState` derives the `expiring` status client-side from
 *    the dates already stored. Busting the cache ensures the next page load
 *    gets a fresh gym row and the banner / middleware see the correct state.
 *
 * Security: x-cron-secret header or Bearer token (same as /api/cron/whatsapp).
 * Vercel Cron triggers this via the schedule in vercel.json.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXPIRING_SOON_DAYS } from '@/lib/subscription-utils'

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
  const { invalidateSubscriptionCaches } = await import('@/lib/cache')
  const now = new Date()

  // ── 1. Expire lapsed trials ───────────────────────────────────────────────
  const { data: expiredTrials, error: trialsError } = await supabase
    .from('gyms')
    .update({ subscription_status: 'expired' })
    .eq('subscription_status', 'trial')
    .lt('trial_ends_at', now.toISOString())
    .select('id, owner_id')

  if (trialsError) {
    console.error('[Cron/Sub] Failed to expire trials:', trialsError)
    return NextResponse.json({ error: trialsError.message }, { status: 500 })
  }

  // ── 2. Expire lapsed paid subscriptions ───────────────────────────────────
  // Lifetime plans store subscription_ends_at = NULL, so .lt() never matches them.
  const { data: expiredSubs, error: subsError } = await supabase
    .from('gyms')
    .update({ subscription_status: 'expired' })
    .eq('subscription_status', 'active')
    .lt('subscription_ends_at', now.toISOString())
    .select('id, owner_id')

  if (subsError) {
    console.error('[Cron/Sub] Failed to expire subscriptions:', subsError)
    return NextResponse.json({ error: subsError.message }, { status: 500 })
  }

  // ── 3. Bust cache for gyms entering the "expiring soon" window ────────────
  // Select active gyms whose subscription_ends_at is between now and
  // now + EXPIRING_SOON_DAYS. These gyms don't need a status DB write, but
  // their cached gym row must be evicted so computeSubscriptionState returns
  // 'expiring' on the next request rather than serving a stale 'active' verdict.
  const windowEdge = new Date(now)
  windowEdge.setDate(windowEdge.getDate() + EXPIRING_SOON_DAYS)

  const { data: expiringSoon } = await supabase
    .from('gyms')
    .select('id, owner_id')
    .eq('subscription_status', 'active')
    .gte('subscription_ends_at', now.toISOString())       // not yet lapsed
    .lte('subscription_ends_at', windowEdge.toISOString()) // within window

  // Also include trials entering the warning window
  const { data: trialExpiringSoon } = await supabase
    .from('gyms')
    .select('id, owner_id')
    .eq('subscription_status', 'trial')
    .gte('trial_ends_at', now.toISOString())
    .lte('trial_ends_at', windowEdge.toISOString())

  // ── 4. Invalidate Redis cache for all affected owners ─────────────────────
  const allAffected = [
    ...(expiredTrials   ?? []),
    ...(expiredSubs     ?? []),
    ...(expiringSoon    ?? []),
    ...(trialExpiringSoon ?? []),
  ]

  // Deduplicate by owner_id to avoid redundant deletions
  const seen = new Set<string>()
  const deduplicated = allAffected.filter(g => {
    if (seen.has(g.owner_id)) return false
    seen.add(g.owner_id)
    return true
  })

  await Promise.all(
    deduplicated.map(async gym => {
      const { data: userData } = await supabase.auth.admin.getUserById(gym.owner_id)
      await invalidateSubscriptionCaches(gym.owner_id, userData?.user?.email)
    })
  )

  console.log(
    `[Cron/Sub] Expired: ${expiredTrials?.length ?? 0} trial(s), ${expiredSubs?.length ?? 0} sub(s). ` +
    `Cache busted for expiring-soon: ${(expiringSoon?.length ?? 0) + (trialExpiringSoon?.length ?? 0)} gym(s).`
  )

  return NextResponse.json({
    expired:            (expiredTrials?.length ?? 0) + (expiredSubs?.length ?? 0),
    trials:             expiredTrials?.length ?? 0,
    subscriptions:      expiredSubs?.length ?? 0,
    expiringSoonBusted: (expiringSoon?.length ?? 0) + (trialExpiringSoon?.length ?? 0),
  })
}

// Allow GET for Vercel's cron ping
export async function GET(req: NextRequest) {
  return POST(req)
}
