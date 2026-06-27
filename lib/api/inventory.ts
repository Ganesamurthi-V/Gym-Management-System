import { createClient } from '@/lib/supabase/server'
import { redis } from '@/lib/redis'

// Cache expiry in seconds (10 minutes). 
const CACHE_EXPIRY = 600

export async function getCachedInventory(gymId: string) {
  const cacheKey = `inventory:${gymId}`

  // 1. Try fetching from Redis
  const cachedData = await redis.get<any[]>(cacheKey)
  if (cachedData) {
    return cachedData
  }

  // 2. Cache miss -> Fetch from Supabase
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching inventory from Supabase:', error)
    throw error
  }

  const items = data || []

  // 3. Store in Redis
  await redis.set(cacheKey, items, { ex: CACHE_EXPIRY })

  return items
}

export async function getCachedInventoryItem(gymId: string, itemId: string) {
  const cacheKey = `inventory-item:${itemId}`

  const cachedData = await redis.get<any>(cacheKey)
  if (cachedData) {
    return cachedData
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', itemId)
    .eq('gym_id', gymId)
    .single()

  if (error || !data) {
    return null
  }

  await redis.set(cacheKey, data, { ex: CACHE_EXPIRY })

  return data
}

export async function getCachedInventorySales(itemId: string) {
  const cacheKey = `inventory-sales:${itemId}`

  const cachedData = await redis.get<any[]>(cacheKey)
  if (cachedData) {
    return cachedData
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory_sales')
    .select('*')
    .eq('inventory_id', itemId)
    .order('sold_at', { ascending: false })

  // Ignore error as migration might not be run
  const sales = data || []

  await redis.set(cacheKey, sales, { ex: CACHE_EXPIRY })

  return sales
}

export async function getCachedInventorySiblings(gymId: string, productName: string) {
  // Not heavily caching siblings to keep it simple, but we could!
  // For now, let's just query Supabase directly for siblings since they are fetched per-item.
  // Or we can fetch them from the `inventory:${gymId}` cache! That's faster!
  
  const allItems = await getCachedInventory(gymId)
  return allItems.filter((i: any) => i.product_name === productName).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}
