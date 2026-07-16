import { SupabaseClient } from '@supabase/supabase-js'

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

  const now = new Date()
  const isExpired =
    !gym ||
    gym.subscription_status === 'expired' ||
    (gym.subscription_status === 'trial' &&
      gym.trial_ends_at &&
      new Date(gym.trial_ends_at) < now) ||
    // Lapsed paid subscription the cron hasn't flipped yet (lifetime = null, never lapses)
    (gym.subscription_status === 'active' &&
      gym.subscription_ends_at &&
      new Date(gym.subscription_ends_at) < now)

  if (isExpired) {
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
