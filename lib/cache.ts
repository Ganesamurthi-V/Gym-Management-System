import { getRedisClient } from './redis'

/**
 * Get a value from the Redis cache.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const data = await redis.get<T>(key)

    if (data !== null) {
      console.log(`CACHE HIT: ${key}`)
      return data
    }

    console.log(`CACHE MISS: ${key}`)
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

import type { PerformanceMetrics } from '@/lib/performance'

/**
 * A higher-order wrapper that abstracts the cache lookup and miss logic.
 * Guarantees that the app never crashes if Redis goes down.
 */
export async function cacheWrapper<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  perf?: PerformanceMetrics
): Promise<T> {
  if (perf) perf.start('CacheWrapper Total')
  
  if (perf) perf.start('Redis GET')
  const startTime = Date.now()
  const cachedData = await getCache<T>(key)
  if (perf) perf.end('Redis GET')

  if (cachedData !== null) {
    if (perf) perf.end('CacheWrapper Total')
    logCacheMetric('HIT', key, Date.now() - startTime)
    return cachedData
  }

  // Cache Miss: Execute the database query
  if (perf) perf.start('FetchFn')
  const freshData = await fetchFn()
  if (perf) perf.end('FetchFn')

  // Store in cache
  if (perf) perf.start('Redis SET')
  await setCache(key, freshData, ttlSeconds)
  if (perf) perf.end('Redis SET')
  
  if (perf) perf.end('CacheWrapper Total')
  
  // Backwards compatibility for global stats
  logCacheMetric('MISS', key, Date.now() - startTime)
  return freshData
}

let globalCacheStats = {
  hits: 0,
  misses: 0,
  total: 0
}

// Internal metric logger
function logCacheMetric(type: 'HIT' | 'MISS', key: string, durationMs: number) {
  globalCacheStats.total++
  if (type === 'HIT') {
    globalCacheStats.hits++
  } else {
    globalCacheStats.misses++
  }

  const hitRate = Math.round((globalCacheStats.hits / globalCacheStats.total) * 100)

  console.log(`[CACHE][Event] ${type}: ${key} - ${durationMs}ms`)
  console.log(`[CACHE] Hits: ${globalCacheStats.hits} | Misses: ${globalCacheStats.misses} | Hit Rate: ${hitRate}%`)
}
