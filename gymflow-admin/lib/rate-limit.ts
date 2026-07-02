import { redis } from './redis'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Rate limiting middleware for admin panel API routes
 * Prevents abuse by limiting requests per IP address
 */
export async function rateLimit(
  req: NextRequest,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  const rateLimitKey = `rate_limit:${key}:${ip}`

  try {
    const current = await redis.incr(rateLimitKey)
    
    // Set expiry only on first request
    if (current === 1) {
      await redis.expire(rateLimitKey, windowSeconds)
    }

    if (current > limit) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { 
          status: 429,
          headers: {
            'Retry-After': String(windowSeconds),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
          }
        }
      )
    }

    return null
  } catch (error) {
    console.error('Rate limiting error:', error)
    // If Redis fails, allow request to proceed (fail open for availability)
    return null
  }
}

/**
 * Rate limit presets for common operations
 */
export const RATE_LIMITS = {
  // Strict limits for sensitive operations
  SUPPORT_MESSAGE: { limit: 10, window: 300 },      // 10 messages per 5 minutes
  TICKET_RESOLVE: { limit: 20, window: 300 },       // 20 resolutions per 5 minutes
  GYM_BAN: { limit: 5, window: 600 },               // 5 bans per 10 minutes
  
  // Moderate limits for read operations
  GYM_LIST: { limit: 100, window: 60 },             // 100 requests per minute
  TICKET_LIST: { limit: 100, window: 60 },          // 100 requests per minute
  
  // Lenient limits for lightweight operations
  TICKET_COUNT: { limit: 300, window: 60 },         // 300 requests per minute
} as const
