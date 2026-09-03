import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redeemLimiter = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(10, '5 m'),
  prefix: 'ratelimit:activate-redeem',
})

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

/** Supabase OTP types this endpoint will redeem. */
type RedeemType = 'magiclink' | 'email'

function fail(status: number, error: string, code: string) {
  return NextResponse.json({ success: false, error, code }, { status, headers: NO_STORE })
}

/**
 * POST /api/activate/redeem
 *
 * Redeems the TokenHash from the MEMBER activation email and establishes the
 * session as HttpOnly cookies.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The member email used to link to `{{ .ConfirmationURL }}`, i.e. Supabase's own
 * `/auth/v1/verify` endpoint. That URL redeems the one-time token on ANY GET, so
 * a mail scanner or link previewer fetching it consumed the token before the
 * member ever tapped it — the reported "link expired immediately".
 *
 * The template now emits `{{ .RedirectTo }}#token_hash=…&type=magiclink`
 * instead. A URL fragment is never transmitted in an HTTP request, so scanners
 * that fetch the page URL get an ordinary page and consume nothing. The token
 * reaches this endpoint only after a real click in the browser.
 *
 * This is the member counterpart of `/api/auth/verify-email`. A separate route
 * rather than a shared one because that endpoint coerces `type` to
 * email|signup|recovery and additionally requires `email_confirmed_at` on the
 * returned user — neither of which fits a `magiclink` redemption.
 *
 * Body: { token_hash: string, type?: 'magiclink' | 'email' }
 * Success: { success: true, userId: string, email: string | null }
 *
 * The caller follows up with POST /api/activate/finalize to perform the
 * member-row writes; that split is unchanged from the previous implicit flow.
 */
export async function POST(req: NextRequest) {
  try {
    // A browser will not attach this header to a simple cross-origin request
    // without a preflight, so its presence means the call came from our own JS.
    if (req.headers.get('x-requested-with') !== 'XMLHttpRequest') {
      return fail(400, 'Invalid request', 'INVALID_REQUEST')
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'

    const { success } = await redeemLimiter.limit(ip)
    if (!success) {
      return fail(429, 'Too many attempts. Please wait a few minutes and try again.', 'RATE_LIMITED')
    }

    let body: { token_hash?: unknown; type?: unknown }
    try {
      body = await req.json()
    } catch {
      return fail(400, 'Invalid request', 'INVALID_REQUEST')
    }

    const tokenHash = body.token_hash

    // Same bounds the owner flow applies. A token hash is a fixed-length hex
    // string; anything with whitespace or of an implausible length is junk.
    if (
      typeof tokenHash !== 'string' ||
      tokenHash.length < 16 ||
      tokenHash.length > 1024 ||
      /\s/.test(tokenHash)
    ) {
      return fail(400, 'This verification link is invalid.', 'INVALID_TOKEN')
    }

    // `signInWithOtp` against an existing user issues a magiclink token. `email`
    // is accepted as well so the endpoint keeps working if the template's type
    // parameter is ever changed.
    const type: RedeemType = body.type === 'email' ? 'email' : 'magiclink'

    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

    if (error || !data.user) {
      // Logged in full server-side; the response stays generic.
      console.error(`[activate/redeem] verifyOtp failed (${type}):`, error?.message ?? 'no user')

      const message = error?.message?.toLowerCase() ?? ''
      const expired =
        message.includes('expired') ||
        message.includes('invalid') ||
        message.includes('used')

      return fail(
        401,
        expired
          ? 'This verification link has expired or was already used.'
          : 'We could not verify this link. Please request a new one.',
        expired ? 'TOKEN_EXPIRED' : 'VERIFICATION_FAILED',
      )
    }

    return NextResponse.json(
      { success: true, userId: data.user.id, email: data.user.email ?? null },
      { headers: NO_STORE },
    )
  } catch (err) {
    console.error('[activate/redeem] unexpected error:', err)
    return fail(500, 'We could not verify your link right now. Please try again.', 'INTERNAL_ERROR')
  }
}
