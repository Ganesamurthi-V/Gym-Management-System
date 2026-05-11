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
  NORMALIZE: 10,
  BATCH_NORMALIZE: 3,
  SAVE_ALIAS: 20,
  DEFAULT: 50
} as const
