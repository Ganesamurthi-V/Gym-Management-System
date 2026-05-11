/**
 * Server-side in-memory rate limiter.
 *
 * Groq llama-3.1-8b-instant limits (free tier):
 *   30 RPM  |  14,400 RPD  |  6,000 TPM  |  500,000 TPD
 *
 * ROUTE_LIMITS below are per-user-per-minute caps enforced BEFORE we hit Groq,
 * so the sum of all users' requests stays under 30 RPM globally.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const limits = new Map<string, RateLimitEntry>()

export function checkRateLimit(userId: string, route: string, rpm: number): { allowed: boolean; resetAt: number } {
  const now = Date.now()
  const key = `${userId}:${route}`
  const entry = limits.get(key)

  if (!entry || now > entry.resetAt) {
    const newEntry = { count: 1, resetAt: now + 60_000 }
    limits.set(key, newEntry)
    return { allowed: true, resetAt: newEntry.resetAt }
  }

  if (entry.count >= rpm) {
    return { allowed: false, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, resetAt: entry.resetAt }
}

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
