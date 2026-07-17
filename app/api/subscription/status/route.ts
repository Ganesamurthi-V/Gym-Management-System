import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/dal'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/status
 *
 * Returns the current subscription state for the authenticated user's gym.
 * Used by the mobile app (gymflow-mobile) to check trial/active/expired status
 * and display the renewal screen when needed.
 */
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: gym } = await supabase
    .from('gyms')
    .select(`
      id, subscription_status, plan_type,
      trial_started_at, trial_ends_at,
      subscription_started_at, subscription_ends_at
    `)
    .eq('owner_id', user.id)
    .single()

  if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('upi_id, upi_name, price_monthly, price_yearly')
    .single()

  const { data: pendingRequest } = await supabase
    .from('subscription_requests')
    .select('status, submitted_at')
    .eq('gym_id', gym.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const subState = getSubscriptionState(gym as any)

  // Derive a human-readable expiry date for whichever window is active so the
  // mobile app never has to pick between trialEndsAt / subscriptionEndsAt itself.
  const effectiveExpiryAt =
    gym.subscription_status === 'trial'
      ? gym.trial_ends_at
      : gym.subscription_ends_at ?? null

  return NextResponse.json({
    subscriptionStatus: gym.subscription_status,
    planType:           gym.plan_type,
    trialEndsAt:        gym.trial_ends_at,
    subscriptionEndsAt: gym.subscription_ends_at,
    effectiveExpiryAt,
    subState: {
      status:         subState.status,
      daysLeft:       subState.daysLeft,
      isExpired:      subState.isExpired,
      isExpiringSoon: subState.isExpiringSoon,
    },
    settings:           settings ?? null,
    pendingRequest:     pendingRequest ?? null,
  })
}
