import { SupabaseClient } from '@supabase/supabase-js'
import { computeSubscriptionState } from '@/lib/subscription-utils'

/**
 * requireActiveSubscription
 *
 * Shared guard for API route handlers. Checks that the gym's subscription
 * is active (or still within the trial window). Returns { allowed: true }
 * when the gym can proceed, or { allowed: false, response } with a 403 when
 * the subscription is expired.
 *
 * Usage in any route handler:
 *   const guard = await requireActiveSubscription(supabase, gym.id)
 *   if (!guard.allowed) return guard.response!
 */
export async function requireActiveSubscription(
  supabase: SupabaseClient,
  gymId: string
): Promise<{ allowed: boolean; response?: Response }> {
  const { data: gym } = await supabase
    .from('gyms')
    .select('subscription_status, trial_ends_at, subscription_ends_at')
    .eq('id', gymId)
    .single()

  const subState = computeSubscriptionState(gym)

  if (subState.isExpired) {
    return {
      allowed: false,
      response: Response.json(
        { error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' },
        { status: 403 }
      ),
    }
  }

  return { allowed: true }
}
