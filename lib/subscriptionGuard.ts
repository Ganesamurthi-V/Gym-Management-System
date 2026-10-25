import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gymIsWritable, type GymSubscriptionFields } from '@/lib/subscription-utils'

/** Shown for every refused write; the same words in routes, server actions and withAuth. */
export const SUBSCRIPTION_ENDED_MESSAGE = 'Your subscription has ended. Renew to make changes.'

type WritableGym = GymSubscriptionFields & { is_active?: boolean | null }

/**
 * A lapsed or deactivated gym is read-only on the server. The UI paywall alone is not enough:
 * a direct API call or server action skips it. withAuth does this for its routes; routes and
 * actions that authenticate on their own call these helpers before any write.
 *
 * Returns a 403 NextResponse to hand straight back, or null when the gym may write.
 */
export function assertGymWritable(gym: WritableGym | null | undefined): NextResponse | null {
  if (gymIsWritable(gym)) return null
  return NextResponse.json(
    { success: false, error: { code: 'SUBSCRIPTION_REQUIRED', message: SUBSCRIPTION_ENDED_MESSAGE } },
    { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/**
 * Loads the gym's subscription columns by id with the caller's own client (RLS applies) and
 * applies assertGymWritable. Fails closed: a failed or empty read refuses the write rather than
 * letting a lapsed gym through on a transient error. Never cached: this is access-control state.
 */
export async function assertGymWritableById(
  supabase: SupabaseClient,
  gymId: string,
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from('gyms')
    .select('is_active, subscription_status, plan_type, trial_ends_at, subscription_ends_at')
    .eq('id', gymId)
    .maybeSingle()
  if (error || !data) return assertGymWritable(null)
  return assertGymWritable(data)
}
