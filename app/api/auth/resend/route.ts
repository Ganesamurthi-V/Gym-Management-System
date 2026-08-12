import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// 3 resend attempts per 5 minutes per IP
const resendLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '5 m'),
  prefix: 'ratelimit:resend',
})

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/resend
 *
 * Server-side confirmation email resend so the browser never calls supabase.co.
 *
 * Body: { email?, type?: 'signup' }
 *
 * The email can come from:
 *   1. The request body (from the create-account page that knows the email)
 *   2. The current session's user email (when a partially-valid session exists,
 *      e.g. expired access token but the cookie still holds the user identity)
 *
 * If neither is available, returns 400.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'

    const { success, reset } = await resendLimiter.limit(ip)
    if (!success) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes before requesting another email.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) } }
      )
    }

    let body: { email?: string; type?: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    let { email, type = 'signup' } = body

    // If no email was provided, try to get it from the current session.
    // This handles the case where the user is on /auth/setup-password with an
    // expired token — the session cookie might still hold their identity even
    // though the access token expired.
    if (!email) {
      try {
        const supabaseForSession = await createClient()
        const { data } = await supabaseForSession.auth.getUser()
        if (data?.user?.email) {
          email = data.user.email
        }
      } catch { /* session lookup failed — email is still required */ }
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/setup-password`

    const supabase = await createClient()
    const { error } = await supabase.auth.resend({
      type: type as 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectUrl },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
