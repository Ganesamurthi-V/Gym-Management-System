'use server'

import { redis } from '@/lib/redis'
import { createClient } from '@/lib/supabase/server'

async function requireAuth() {
  const supabase = await createClient()
  // getSession() is JWT-local (no network). Deleting a cache key only forces an
  // RLS-protected re-fetch, so a login check is enough — the previous getUser()
  // network call + gyms ownership SELECT added round trips for no security gain.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) throw new Error('Unauthorized')
}

export async function invalidateInventoryCache(gymId: string) {
  await requireAuth()
  await redis.del(`inventory:${gymId}`)
}

export async function invalidateInventoryItemCache(gymId: string, itemId: string) {
  await requireAuth()
  // Wipe the individual item, its sales, and the global list cache in parallel.
  await Promise.all([
    redis.del(`inventory-item:${itemId}`),
    redis.del(`inventory-sales:${itemId}`),
    redis.del(`inventory:${gymId}`),
  ])
}
