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
 * Body: { email, type?: 'signup' }
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

    const { email, type = 'signup' } = body

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
