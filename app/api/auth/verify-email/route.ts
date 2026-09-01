import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const verificationLimiter = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(10, '5 m'),
  prefix: 'ratelimit:verify-email',
})

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

type VerificationType = 'email' | 'signup' | 'recovery'

function fail(status: number, error: string, code: string) {
  return NextResponse.json(
    { success: false, error, code },
    { status, headers: NO_STORE },
  )
}

/**
 * POST /api/auth/verify-email
 *
 * Verifies the TokenHash embedded in GymFlow's hosted Supabase confirmation
 * email template. The template points directly to /auth/setup-password and
 * places the hash in the URL fragment. Email security scanners therefore see
 * only the harmless page URL; the one-time token is submitted here only after
 * the owner explicitly confirms in the UI.
 *
 * This is still Supabase Auth. verifyOtp creates the normal Supabase session
 * and the SSR cookie adapter stores it in HttpOnly cookies for the remaining
 * password-setup flow.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'
    const { success } = await verificationLimiter.limit(ip)
    if (!success) {
      return fail(429, 'Too many verification attempts. Please wait a few minutes and try again.', 'RATE_LIMITED')
    }

    let body: { token_hash?: unknown; type?: unknown }
    try {
      body = await req.json()
    } catch {
      return fail(400, 'Invalid request', 'INVALID_REQUEST')
    }

    const tokenHash = body.token_hash
    const type: VerificationType =
      body.type === 'signup' || body.type === 'recovery'
        ? body.type
        : 'email'

    if (
      typeof tokenHash !== 'string' ||
      tokenHash.length < 16 ||
      tokenHash.length > 1024 ||
      /\s/.test(tokenHash)
    ) {
      return fail(400, 'This verification link is invalid.', 'INVALID_TOKEN')
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (error || !data.user) {
      console.error('[auth/verify-email] verification failed:', error?.message ?? 'no user')

      const message = error?.message?.toLowerCase() ?? ''
      const expired =
        message.includes('expired') ||
        message.includes('invalid') ||
        message.includes('used')

      return fail(
        401,
        expired
          ? 'This verification link has expired or was already used.'
          : 'We could not verify this email address. Please request a new link.',
        expired ? 'TOKEN_EXPIRED' : 'VERIFICATION_FAILED',
      )
    }

    if (!data.user.email_confirmed_at) {
      console.error('[auth/verify-email] user returned without confirmed email', {
        userId: data.user.id,
      })
      return fail(
        403,
        'Your email address could not be confirmed. Please request a new link.',
        'EMAIL_NOT_CONFIRMED',
      )
    }

    return NextResponse.json(
      {
        success: true,
        userId: data.user.id,
        email: data.user.email ?? null,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error('[auth/verify-email] unexpected error:', error)
    return fail(500, 'We could not verify your email right now. Please try again.', 'INTERNAL_ERROR')
  }
}
