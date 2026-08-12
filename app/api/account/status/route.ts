import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/account/status
 *
 * Returns the authenticated user's gym subscription/active status.
 * Used by ShellGuard and SubscriptionClient for realtime sync callbacks.
 */
export const GET = withAuth('ACCOUNT_STATUS_GET', async (req: NextRequest, { supabase, gym }) => {
  const { data, error } = await supabase
    .from('gyms')
    .select('name, is_active, subscription_status, plan_type, trial_started_at, trial_ends_at, subscription_started_at, subscription_ends_at')
    .eq('id', gym.id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } },
      { status: 404 }
    )
  }

  return NextResponse.json(
    { success: true, data },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
