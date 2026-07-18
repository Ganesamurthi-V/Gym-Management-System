import { getRedisClient } from './redis'
import { cacheKeys } from './cache-keys'

/**
 * Get a value from the Redis cache.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const data = await redis.get<T>(key)

    if (data !== null) {
      if (process.env.NODE_ENV === 'development') console.log(`CACHE HIT: ${key}`)
      return data
    }

    if (process.env.NODE_ENV === 'development') console.log(`CACHE MISS: ${key}`)
    return null

  } catch (error) {
    console.warn(`[Cache Error] Failed to get key ${key}:`, error)
    return null
  }
}

/**
 * Set a value in the Redis cache with a TTL (Time To Live) in seconds.
 */
export async function setCache<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    await redis.set(key, data, { ex: ttlSeconds })
  } catch (error) {
    console.warn(`[Cache Error] Failed to set key ${key}:`, error)
  }
}

/**
 * Delete a specific key from the cache.
 */
export async function deleteCache(key: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    await redis.del(key)
  } catch (error) {
    console.warn(`[Cache Error] Failed to delete key ${key}:`, error)
  }
}

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

import type { RequestLogger } from '@/lib/logger'

/**
 * A higher-order wrapper that abstracts the cache lookup and miss logic.
 * Guarantees that the app never crashes if Redis goes down.
 */
export async function cacheWrapper<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  logger?: RequestLogger
): Promise<T> {
  if (logger) logger.info('CACHE ENTER')
  
  try {
    if (logger) logger.start('REDIS GET')
    const startTime = Date.now()
    const cachedData = await getCache<T>(key)
    if (logger) logger.end('REDIS GET')

    if (cachedData !== null) {
      if (logger) logger.info('CACHE HIT')
      if (logger) logger.info('RETURNING CACHED DATA')
      logCacheMetric('HIT', key, Date.now() - startTime)
      return cachedData
    }

    if (logger) logger.info('CACHE MISS')

    // Cache Miss: Execute the database query
    if (logger) logger.start('FETCHFN')
    const freshData = await fetchFn()
    if (logger) logger.end('FETCHFN')

    // Store in cache
    if (logger) logger.start('REDIS SET')
    await setCache(key, freshData, ttlSeconds)
    if (logger) logger.end('REDIS SET')
    
    if (logger) logger.info('RETURNING FRESH DATA')
    
    // Backwards compatibility for global stats
    logCacheMetric('MISS', key, Date.now() - startTime)
    return freshData
  } catch (error: any) {
    if (logger) logger.error('ERROR', error)
    throw error
  }
}

// Internal metric logger — dev only, no global state (meaningless in serverless)
function logCacheMetric(type: 'HIT' | 'MISS', key: string, durationMs: number) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[CACHE][Event] ${type}: ${key} - ${durationMs}ms`)
  }
}

/**
 * Invalidates the gym identity cache for a specific owner.
 * Call this after any write to gym name or onboarding fields.
 *
 * Subscription fields (subscription_status, trial_ends_at, etc.) are no longer
 * cached, so writes to those columns need no cache invalidation.
 */
export async function invalidateGymIdentityCache(userId: string): Promise<void> {
  await deleteCache(cacheKeys.gym(userId))
}
