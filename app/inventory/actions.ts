'use server'

import { redis } from '@/lib/redis'

export async function invalidateInventoryCache(gymId: string) {
  await redis.del(`inventory:${gymId}`)
}

export async function invalidateInventoryItemCache(gymId: string, itemId: string) {
  // Wipe both the individual item, its sales, and the global list cache
  await redis.del(`inventory-item:${itemId}`)
  await redis.del(`inventory-sales:${itemId}`)
  await redis.del(`inventory:${gymId}`)
}
