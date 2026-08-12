import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Strict rate limit: 5 attempts per minute per IP to prevent brute-force
const adminAuthLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:admin_auth',
})

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP address
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'

    const { success, reset } = await adminAuthLimiter.limit(ip)
    if (!success) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) },
        }
      )
    }

    const { password } = await req.json()
    const validPassword = process.env.ADMIN_PASSWORD

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }

    // Fail closed when the secret is not configured, rather than comparing
    // against `undefined` and risking an accidental match.
    if (!validPassword || validPassword.trim().length < 16) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    // Constant-time comparison — fixed-width digests so no length is leaked.
    const a = createHash('sha256').update(password, 'utf8').digest()
    const b = createHash('sha256').update(validPassword, 'utf8').digest()
    if (!timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 })
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
