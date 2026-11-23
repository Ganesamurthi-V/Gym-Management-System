'use server'

import { redis } from '@/lib/redis'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/dal'

// Deleting a cache key is harmless on its own, but without an ownership check any
// signed-in user (even a member) could flush any gym's cache on demand. getAuthUser()
// verifies the JWT signature locally; the gyms lookup is RLS-scoped and returns nothing for non-owners.
async function requireGymOwner(gymId: string) {
  const supabase = await createClient()
  const { user } = await getAuthUser()
  if (!user) throw new Error('Unauthorized')
  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('id', gymId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!gym) throw new Error('Unauthorized')
}

export async function invalidateInventoryCache(gymId: string) {
  await requireGymOwner(gymId)
  await redis.del(`inventory:${gymId}`)
}

export async function invalidateInventoryItemCache(gymId: string, itemId: string) {
  await requireGymOwner(gymId)
  // Wipe the individual item, its sales, and the global list cache in parallel.
  await Promise.all([
    redis.del(`inventory-item:${itemId}`),
    redis.del(`inventory-sales:${itemId}`),
    redis.del(`inventory:${gymId}`),
  ])
}
