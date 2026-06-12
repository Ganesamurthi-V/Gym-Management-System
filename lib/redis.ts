import { Redis } from '@upstash/redis'

/**
 * Singleton Redis client for Vercel Serverless environment.
 * Uses HTTP/REST to avoid TCP connection limits and TLS handshake overhead.
 * Gracefully degrades if UPSTASH_REDIS_REST_URL is missing.
 */
let redisClient: Redis | null = null

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    console.warn('⚠️  Upstash Redis environment variables missing. Running in degraded (no-cache) mode.')
    return null
  }

  try {
    redisClient = new Redis({
      url,
      token,
      // Retry up to 3 times on network failure with exponential backoff
      retry: {
        retries: 3,
        backoff: (retryCount) => Math.exp(retryCount) * 50,
      },
    })
    return redisClient
  } catch (error) {
    console.error('❌ Failed to initialize Upstash Redis client:', error)
    return null
  }
}
