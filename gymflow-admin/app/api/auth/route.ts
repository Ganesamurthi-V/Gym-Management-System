import { NextRequest, NextResponse } from 'next/server'
import { createAdminSession, COOKIE_NAME, SESSION_DURATION } from '@/lib/auth'
import { redis } from '@/lib/redis'

// POST /api/auth — Login with password
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const key = `admin_login_attempts:${ip}`
  const attempts = await redis.incr(key)
  if (attempts === 1) await redis.expire(key, 900) // 15-minute window
  if (attempts > 10) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const { password } = await req.json()

  const secret = process.env.ADMIN_PANEL_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (password !== secret) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = await createAdminSession()

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  })
  return res
}

// DELETE /api/auth — Logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE_NAME)
  return res
}
