import { createClient } from '@/lib/supabase/server'
import { getCache, setCache } from '@/lib/cache'

// Cache expiry in seconds (10 minutes).
const CACHE_EXPIRY = 600

// NOTE: these helpers previously used the raw `redis` client, which bypassed the
// MAX_CACHEABLE_BYTES guard in lib/cache.ts. An inventory list of 500 items
// serialises to well over that limit, and Upstash reads become slower than
// Postgres above ~15KB (see the measurements in lib/cache.ts). Going through
// getCache/setCache means oversized lists simply are not stored, and the read
// path falls through to the database — which is faster.

export async function getCachedInventory(gymId: string) {
  const cacheKey = `inventory:${gymId}`

  const cachedData = await getCache<any[]>(cacheKey)
  if (cachedData) return cachedData

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('id, product_name, variant_name, brand, category, sku, selling_price, initial_stock, low_stock_threshold, created_at')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('Error fetching inventory from Supabase:', error)
    throw error
  }

  const items = data || []
  await setCache(cacheKey, items, CACHE_EXPIRY)
  return items
}

export async function getCachedInventoryItem(gymId: string, itemId: string) {
  const cacheKey = `inventory-item:${itemId}`

  const cachedData = await getCache<any>(cacheKey)
  if (cachedData) return cachedData

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('id, gym_id, product_name, brand, category, sku, description, variant_name, cost_price, selling_price, member_price, initial_stock, low_stock_threshold, created_at, updated_at')
    .eq('id', itemId)
    .eq('gym_id', gymId)
    .single()

  if (error || !data) return null

  await setCache(cacheKey, data, CACHE_EXPIRY)
  return data
}

export async function getCachedInventorySales(itemId: string) {
  const cacheKey = `inventory-sales:${itemId}`

  const cachedData = await getCache<any[]>(cacheKey)
  if (cachedData) return cachedData

  const supabase = await createClient()
  const { data } = await supabase
    .from('inventory_sales')
    .select('id, product_name, variant_name, quantity, unit_price, total_price, payment_mode, sold_at')
    .eq('inventory_id', itemId)
    .order('sold_at', { ascending: false })
    .limit(200)

  const sales = data || []
  await setCache(cacheKey, sales, CACHE_EXPIRY)
  return sales
}

export async function getCachedInventorySiblings(gymId: string, productName: string) {
  // Leverage the cached inventory list to find siblings without an extra DB call
  const allItems = await getCachedInventory(gymId)
  return allItems
    .filter((i: any) => i.product_name === productName)
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}
