import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// 10 login attempts per minute per IP — strict enough to block brute-force
// but lenient enough for legitimate users who mistype their password.
const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'ratelimit:login',
})

// Additional per-email limiter: 5 attempts per 5 minutes per email address.
// Prevents targeted attacks against a single account even from rotating IPs.
const emailLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '5 m'),
  prefix: 'ratelimit:login_email',
})

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/login
 *
 * Server-side login endpoint with dual rate limiting (IP + email).
 * Wraps Supabase signInWithPassword so we can enforce stricter limits
 * than Supabase's defaults before any auth attempt reaches the DB.
 *
 * Body: { email: string, password: string }
 * Returns: { success: true } on success (session cookie is set by Supabase SSR)
 *          { error: string } on failure
 */
export async function POST(req: NextRequest) {
  try {
    // ── Rate limit by IP ───────────────────────────────────────────────────
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'

    const { success: ipAllowed, reset: ipReset } = await loginLimiter.limit(ip)
    if (!ipAllowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait a moment and try again.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((ipReset - Date.now()) / 1000)) },
        }
      )
    }

    // ── Parse and validate body ────────────────────────────────────────────
    let body: { email?: string; password?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { email, password } = body

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Basic email format check (prevents junk payloads from hitting rate limiter)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // ── Rate limit by email ────────────────────────────────────────────────
    const normalizedEmail = email.toLowerCase().trim()
    const { success: emailAllowed, reset: emailReset } = await emailLimiter.limit(normalizedEmail)
    if (!emailAllowed) {
      return NextResponse.json(
        { error: 'Too many attempts for this account. Please try again in a few minutes.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((emailReset - Date.now()) / 1000)) },
        }
      )
    }

    // ── Attempt sign-in ────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (signInError || !data.user) {
      // Generic message — don't reveal whether the email exists
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // ── Check if gym is deactivated ────────────────────────────────────────
    const { data: gymStatus } = await supabase
      .from('gyms')
      .select('is_active')
      .eq('owner_id', data.user.id)
      .single()

    if (gymStatus?.is_active === false) {
      await supabase.auth.signOut()
      return NextResponse.json({ error: 'Your access has been suspended by admin' }, { status: 403 })
    }

    // ── Check onboarding status ────────────────────────────────────────────
    const { data: gymData } = await supabase
      .from('gyms')
      .select('onboarding_completed')
      .eq('owner_id', data.user.id)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      onboardingCompleted: gymData?.onboarding_completed ?? false,
      userName: data.user.user_metadata?.name ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
