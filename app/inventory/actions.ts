'use server'

import { redis } from '@/lib/redis'
import { createClient } from '@/lib/supabase/server'

async function checkGymOwnership(gymId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('id', gymId)
    .eq('owner_id', user.id)
    .single()

  if (!gym) throw new Error('Forbidden')
}

export async function invalidateInventoryCache(gymId: string) {
  await checkGymOwnership(gymId)
  await redis.del(`inventory:${gymId}`)
}

export async function invalidateInventoryItemCache(gymId: string, itemId: string) {
  await checkGymOwnership(gymId)
  // Wipe both the individual item, its sales, and the global list cache
  await redis.del(`inventory-item:${itemId}`)
  await redis.del(`inventory-sales:${itemId}`)
  await redis.del(`inventory:${gymId}`)
}
