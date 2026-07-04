import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

/**
 * Server-side rate limiter using Upstash Redis.
 *
 * Groq qwen/qwen3.6-27b limits (free tier):
 *   30 RPM  |  14,400 RPD  |  6,000 TPM  |  500,000 TPD
 *
 * ROUTE_LIMITS below are per-user-per-minute caps enforced BEFORE we hit Groq,
 * so the sum of all users' requests stays under 30 RPM globally.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const ROUTE_LIMITS = {
  /**
   * Single normalisation — each call may use 1 Groq request.
   * Allow max 5 calls/user/min to leave headroom for other routes.
   */
  NORMALIZE: 5,
  /**
   * Batch normalisation — each call may use 1 Groq batch request.
   * Keep to 2/user/min; batches are heavier on tokens.
   */
  BATCH_NORMALIZE: 2,
  SAVE_ALIAS: 20,
  DEFAULT: 30,
} as const

const limiters = {
  [ROUTE_LIMITS.NORMALIZE]: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(ROUTE_LIMITS.NORMALIZE, '1 m') }),
  [ROUTE_LIMITS.BATCH_NORMALIZE]: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(ROUTE_LIMITS.BATCH_NORMALIZE, '1 m') }),
  [ROUTE_LIMITS.SAVE_ALIAS]: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(ROUTE_LIMITS.SAVE_ALIAS, '1 m') }),
  [ROUTE_LIMITS.DEFAULT]: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(ROUTE_LIMITS.DEFAULT, '1 m') }),
}

export async function checkRateLimit(userId: string, route: string, rpm: number): Promise<{ allowed: boolean; resetAt: number }> {
  // Use pre-configured limiter if it matches standard rpm, else default to a new one
  const limiter = limiters[rpm as keyof typeof limiters] || new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(rpm, '1 m') })
  const identifier = `${userId}:${route}`
  const { success, reset } = await limiter.limit(identifier)
  return { allowed: success, resetAt: reset }
}
