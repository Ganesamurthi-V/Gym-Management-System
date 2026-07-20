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
