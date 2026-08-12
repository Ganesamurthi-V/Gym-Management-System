import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// 5 signup attempts per minute per IP — stricter than login since account
// creation should be rare from a single source.
const signupLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:signup',
})

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/signup
 *
 * Server-side account creation so the browser never calls supabase.co directly.
 * Wraps supabase.auth.signUp with rate limiting and input validation.
 *
 * Body: { email, fullName, mobileNumber }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'

    const { success, reset } = await signupLimiter.limit(ip)
    if (!success) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) } }
      )
    }

    let body: { email?: string; fullName?: string; mobileNumber?: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { email, fullName, mobileNumber } = body

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    }

    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/setup-password`

    const supabase = await createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: crypto.randomUUID(), // random password; user sets theirs via email link
      options: {
        data: {
          full_name: fullName.trim(),
          name: fullName.trim(),
          mobile_number: mobileNumber?.trim() || undefined,
        },
        emailRedirectTo: redirectUrl,
      },
    })

    // Email enumeration protection: Supabase returns success with empty identities
    if (!signUpError && data?.user?.identities?.length === 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Try signing in instead.', code: 'ALREADY_EXISTS' },
        { status: 409 }
      )
    }

    if (signUpError) {
      if (signUpError.message.toLowerCase().includes('already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Try signing in instead.', code: 'ALREADY_EXISTS' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: signUpError.message }, { status: 400 })
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
