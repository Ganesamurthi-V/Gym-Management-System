import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/sync
 *
 * Returns the latest subscription request and gym subscription fields
 * for the authenticated user's gym. Used by SubscriptionClient's realtime sync.
 */
export const GET = withAuth('SUBSCRIPTION_SYNC_GET', async (req: NextRequest, { supabase, gym }) => {
  const [requestResult, gymResult] = await Promise.all([
    supabase
      .from('subscription_requests')
      .select('id, status, submitted_at, rejection_reason')
      .eq('gym_id', gym.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('gyms')
      .select('subscription_status, plan_type, trial_started_at, trial_ends_at, subscription_started_at, subscription_ends_at')
      .eq('id', gym.id)
      .single(),
  ])

  return NextResponse.json(
    {
      success: true,
      data: {
        latestRequest: requestResult.data ?? null,
        gym: gymResult.data ?? null,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
