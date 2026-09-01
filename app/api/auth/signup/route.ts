import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  OWNER_REGISTRATION_INDEX_TTL_SECONDS,
  ownerRegistrationAppMetadata,
  ownerRegistrationIndexKey,
} from '@/lib/auth/owner-registration'
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

    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
    const redirectUrl = `${appOrigin}/auth/setup-password`

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
      console.error('[auth/signup] Supabase signup failed:', signUpError.message)
      const rateLimited = /rate|wait|too many/i.test(signUpError.message)
      return NextResponse.json(
        {
          error: rateLimited
            ? 'Too many signup attempts. Please wait a few minutes and try again.'
            : 'We could not create your account right now. Please try again.',
        },
        { status: rateLimited ? 429 : 400 },
      )
    }

    if (!data.user) {
      console.error('[auth/signup] Supabase returned no user and no error')
      return NextResponse.json(
        { error: 'We could not create your account right now. Please try again.' },
        { status: 500 },
      )
    }

    // Mark owner registration in server-controlled app_metadata. Finalization
    // requires this marker (or a tightly checked legacy owner record), so a
    // confirmed member session can never create a gym through this flow.
    const admin = createAdminClient()
    const { error: markerError } = await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: ownerRegistrationAppMetadata(data.user),
    })

    if (markerError) {
      console.error('[auth/signup] failed to mark owner registration:', markerError.message)
      const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id)
      if (cleanupError) {
        console.error('[auth/signup] failed to roll back unmarked user:', cleanupError.message)
      }
      return NextResponse.json(
        { error: 'We could not create your account right now. Please try again.' },
        { status: 500 },
      )
    }

    // Best-effort indexed lookup for cross-device resends. The key is a SHA-256
    // digest of the address, not the email itself. A legacy admin lookup remains
    // available if Redis is temporarily unavailable.
    try {
      await redis.set(ownerRegistrationIndexKey(email), data.user.id, {
        ex: OWNER_REGISTRATION_INDEX_TTL_SECONDS,
      })
    } catch (indexError) {
      console.error('[auth/signup] failed to index owner registration:', indexError)
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    console.error('[auth/signup] unexpected error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
