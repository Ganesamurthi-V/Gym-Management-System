'use server'

import { createClient } from '@/lib/supabase/server'
import { deleteCache, invalidatePattern } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

/**
 * Invalidates the Redis cache for the gym identity row after a write to stable
 * fields like name or onboarding_data.
 *
 * Subscription fields (subscription_status, trial_ends_at, etc.) are no longer
 * cached so writes to those columns need no invalidation here.
 */
export async function invalidateGymCache(): Promise<void> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return

  await deleteCache(cacheKeys.gym(session.user.id))
}

/**
 * Invalidates ALL gym-scoped Redis cache keys after a destructive operation
 * (e.g. "Delete All Member Data"). Busts members list, dashboard, and payments
 * so the UI reflects the empty state immediately after deletion.
 */
export async function invalidateAllGymCaches(gymId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return

  // Verify ownership before busting cache
  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('id', gymId)
    .eq('owner_id', session.user.id)
    .single()
  if (!gym) return

  await Promise.all([
    deleteCache(cacheKeys.membersList(gymId)),
    deleteCache(cacheKeys.dashboard(gymId, format(new Date(), 'yyyy-MM-dd'))),
    deleteCache(cacheKeys.payments12mo(gymId)),
    deleteCache(cacheKeys.paymentsAll(gymId)),
    invalidatePattern(`gym:${gymId}:dashboard:*`),
  ])
}
