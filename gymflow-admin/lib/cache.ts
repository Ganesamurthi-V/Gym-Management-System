import { SupabaseClient } from '@supabase/supabase-js'
import { getRedisClient } from './redis'

/**
 * Invalidate all keys matching a specific pattern (e.g., gym:123:members*)
 * Note: Upstash SCAN is safe for production use.
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    let cursor: string | number = 0
    do {
      const scanResult = await redis.scan(cursor, { match: pattern, count: 100 }) as [string | number, string[]]
      const nextCursor = scanResult[0]
      const keys = scanResult[1]
      if (keys.length > 0) {
        await redis.del(...keys)
      }
      cursor = nextCursor
    } while (cursor !== 0 && cursor !== '0')
  } catch (error) {
    console.warn(`[Cache Error] Failed to invalidate pattern ${pattern}:`, error)
  }
}

/**
 * Bust the main app's subscription caches for a gym owner.
 * Keys mirror the main app's lib/cache-keys.ts — both apps share the same
 * Upstash instance. MUST be called after any write to subscription_status,
 * trial_ends_at, subscription_ends_at, or is_active, otherwise the main app
 * serves stale state for up to 120s.
 */
export async function invalidateSubscriptionCaches(userId: string, email?: string | null): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    const keys = [`user:${userId}:gym`]
    if (email) keys.push(`active_status:${email}`)
    await redis.del(...keys)
  } catch (error) {
    console.warn(`[Cache Error] Failed to invalidate subscription caches for ${userId}:`, error)
  }
}

/**
 * Convenience wrapper: resolves the owner's email from auth.users
 * (the active_status cache key is email-keyed) then busts both keys.
 */
export async function invalidateSubscriptionCachesForOwner(
  supabase: SupabaseClient,
  ownerId: string | null | undefined
): Promise<void> {
  if (!ownerId) return
  let email: string | null = null
  try {
    const { data } = await supabase.auth.admin.getUserById(ownerId)
    email = data?.user?.email ?? null
  } catch {
    // fall through — still bust the gym key
  }
  await invalidateSubscriptionCaches(ownerId, email)
}
