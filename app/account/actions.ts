'use server'

import { createClient } from '@/lib/supabase/server'
import { deleteCache, invalidatePattern } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

/**
 * Invalidates the Redis cache for a gym row after a write to the gyms table.
 * Must be called after any supabase.from('gyms').update() or .upsert() from
 * client components (which cannot import server-only Redis modules directly).
 *
 * Cache key mirrors the one in lib/dal.ts getGym: `user:${userId}:gym`
 */
export async function invalidateGymCache(): Promise<void> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return

  await deleteCache(`user:${session.user.id}:gym`)
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

  // Delete all known gym-scoped cache keys in parallel
  await Promise.all([
    deleteCache(cacheKeys.membersList(gymId)),
    deleteCache(cacheKeys.dashboard(gymId, format(new Date(), 'yyyy-MM-dd'))),
    deleteCache(cacheKeys.payments12mo(gymId)),
    deleteCache(cacheKeys.paymentsAll(gymId)),
    // Wipe any dashboard keys from other dates (e.g. if server clock differs)
    invalidatePattern(`gym:${gymId}:dashboard:*`),
  ])
}
