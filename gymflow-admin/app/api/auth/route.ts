import { NextRequest, NextResponse } from 'next/server'
import {
  createAdminSession, COOKIE_NAME, SESSION_DURATION, MOBILE_SESSION_DURATION,
} from '@/lib/auth'
import { redis } from '@/lib/redis'
import { getClientIp } from '@/lib/rate-limit'
import { secureCompare } from '@/lib/secure-compare'

const MAX_FAILURES = 10
const WINDOW_SECONDS = 900 // 15 minutes

// POST /api/auth — Login with password.
// Body { password } sets the web cookie. Body { password, client: 'mobile' }
// returns { token, expiresAt } as JSON instead (no cookie).
export async function POST(req: NextRequest) {
  const key = `admin_login_failures:${getClientIp(req)}`

  // Only FAILED logins count, and a limiter outage blocks login (fail closed):
  // for the one endpoint that guesses the admin password, being unavailable
  // is safer than being unlimited.
  try {
    // lib/redis.ts's disabled stub (no Upstash env) has no get(); that case is "not configured", not an error.
    const failures = typeof redis.get === 'function' ? Number((await redis.get<number>(key)) ?? 0) : 0
    if (failures >= MAX_FAILURES) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }
  } catch (error) {
    console.error('Redis rate limiting error:', error)
    return NextResponse.json({ error: 'Login temporarily unavailable' }, { status: 503 })
  }

  let body: { password?: unknown; client?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const password = typeof body?.password === 'string' ? body.password : ''
  const mobile = body?.client === 'mobile'

  const secret = process.env.ADMIN_PANEL_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (!password || !(await secureCompare(password, secret))) {
    try {
      const n = await redis.incr(key)
      if (n === 1) await redis.expire(key, WINDOW_SECONDS)
    } catch (error) {
      console.error('Redis rate limiting error:', error)
    }
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  try {
    await redis.del(key)
  } catch {
    // Non-critical
  }

  if (mobile) {
    const token = await createAdminSession('admin-mobile')
    return NextResponse.json({
      token,
      expiresAt: new Date(Date.now() + MOBILE_SESSION_DURATION * 1000).toISOString(),
    })
  }

  const token = await createAdminSession('admin-web')
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_DURATION,
    path: '/',
  })
  return res
}

// DELETE /api/auth — Logout (clears the cookie; bump ADMIN_SESSION_VERSION to revoke tokens everywhere)
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE_NAME)
  return res
}
