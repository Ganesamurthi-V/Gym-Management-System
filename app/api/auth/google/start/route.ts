import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import {
  buildGoogleAuthorizeUrl,
  codeChallengeS256,
  generateCodeVerifier,
  isGoogleConfigured,
  randomToken,
} from '@/lib/auth/google'
import { apiLogger } from '@/lib/logger'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const startLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'ratelimit:google-start',
})

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const
const STATE_TTL_SECONDS = 600

function toLogin(req: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/auth/login?error=${error}`, req.nextUrl.origin), {
    headers: NO_STORE,
  })
}

/**
 * GET /api/auth/google/start
 *
 * Begins our own OAuth2 authorization-code + PKCE flow. The browser is only
 * ever sent to accounts.google.com and back to this origin; Supabase's Google
 * provider is deliberately not used. `state` (CSRF) is bound to the browser by
 * a cookie and to the server-held nonce/verifier by Redis.
 */
export async function GET(req: NextRequest) {
  const log = apiLogger('auth/google/start')
  try {
    if (!isGoogleConfigured()) return toLogin(req, 'google_unavailable')

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'
    const { success } = await startLimiter.limit(ip)
    if (!success) return toLogin(req, 'google_failed')

    const state = randomToken()
    const nonce = randomToken()
    const codeVerifier = generateCodeVerifier()

    await redis.set(`google-oauth:${state}`, { nonce, codeVerifier }, { ex: STATE_TTL_SECONDS })

    // The request's own origin, not NEXT_PUBLIC_APP_URL: the state cookie is bound to the host the
    // flow started on, and a local .env.local pointing at production sent Google back to the live site.
    const origin = req.nextUrl.origin
    const authorizeUrl = buildGoogleAuthorizeUrl({
      state,
      nonce,
      codeChallenge: codeChallengeS256(codeVerifier),
      redirectUri: `${origin}/api/auth/google/callback`,
    })

    const res = NextResponse.redirect(authorizeUrl, { headers: NO_STORE })
    res.cookies.set('gf_google_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // must accompany the top-level redirect back from Google
      path: '/api/auth/google',
      maxAge: STATE_TTL_SECONDS,
    })
    return res
  } catch (err) {
    log.error('start failed', err)
    return toLogin(req, 'google_failed')
  }
}
