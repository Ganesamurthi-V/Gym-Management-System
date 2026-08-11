import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { roleFromClaims, homeForRole } from '@/lib/auth/roles'
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
 * Single sign-in endpoint for BOTH experiences of the unified app.
 *
 * Server-side login with dual rate limiting (IP + email). Wraps Supabase
 * signInWithPassword so we can enforce stricter limits than Supabase's defaults
 * before any auth attempt reaches the DB.
 *
 * ── WHY MEMBERS GO THROUGH HERE TOO ─────────────────────────────────────────
 * The standalone member PWA called `signInWithPassword` directly from the
 * browser, so it was protected only by a localStorage attempt counter that any
 * client can clear. Now that both products share one origin, member sign-in
 * runs through the same Upstash IP + email limiters the owner console uses.
 * The client-side lockout is still applied on top as extra friction.
 *
 * Body: { email: string, password: string }
 * Returns on success — the session cookie is set by Supabase SSR:
 *   { success: true, role: 'owner' | 'member', redirectTo: string,
 *     onboardingCompleted?: boolean, userName?: string | null }
 * On failure: { error: string, code?: string }
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

    // ── Branch on role ─────────────────────────────────────────────────────
    // Same helper the middleware uses, so the endpoint and the router can never
    // disagree about which experience an account belongs to.
    const role = roleFromClaims({ user_metadata: data.user.user_metadata })

    if (role === 'member') {
      // Confirm the account is actually linked to a member row. An auth user
      // marked `role: 'member'` whose `members` row was deleted must not be
      // handed a session that every member page would then reject.
      const { data: member } = await supabase
        .from('members')
        .select('id, name, portal_suspended')
        .eq('auth_user_id', data.user.id)
        .maybeSingle()

      if (!member) {
        await supabase.auth.signOut()
        return NextResponse.json(
          {
            error: 'This account is not linked to a GymFlow member profile. Contact your gym.',
            code: 'NOT_MEMBER',
          },
          { status: 403 }
        )
      }

      if (member.portal_suspended) {
        await supabase.auth.signOut()
        return NextResponse.json(
          { error: 'Your app access is currently suspended. Please contact your gym.', code: 'SUSPENDED' },
          { status: 403 }
        )
      }

      return NextResponse.json({
        success: true,
        role,
        redirectTo: homeForRole(role),
        userName: member.name ?? (data.user.user_metadata?.name as string | undefined) ?? null,
      })
    }

    // ── Owner ──────────────────────────────────────────────────────────────
    // One SELECT covers both the deactivation gate and the onboarding branch;
    // these used to be two separate round trips against the same row.
    const { data: gymRow } = await supabase
      .from('gyms')
      .select('is_active, onboarding_completed')
      .eq('owner_id', data.user.id)
      .maybeSingle()

    if (gymRow?.is_active === false) {
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: 'Your access has been suspended by admin', code: 'BLOCKED' },
        { status: 403 }
      )
    }

    const onboardingCompleted = gymRow?.onboarding_completed ?? false

    return NextResponse.json({
      success: true,
      role,
      onboardingCompleted,
      redirectTo: onboardingCompleted ? homeForRole(role) : '/owner/onboarding',
      userName: (data.user.user_metadata?.name as string | undefined) ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
