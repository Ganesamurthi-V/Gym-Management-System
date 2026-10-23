import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  OWNER_REGISTRATION_INDEX_TTL_SECONDS,
  OWNER_REGISTRATION_METADATA_KEY,
  OWNER_REGISTRATION_METADATA_VALUE,
  hasMemberIdentityMarker,
  ownerRegistrationIndexKey,
} from '@/lib/auth/owner-registration'
import {
  GoogleConfigError,
  decideGoogleSignIn,
  exchangeGoogleCode,
  verifyGoogleIdToken,
} from '@/lib/auth/google'
import { apiLogger } from '@/lib/logger'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const
// Bounded so a huge tenant list cannot make this request run away.
const LIST_USERS_MAX_PAGES = 20

function redirectTo(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.nextUrl.origin), { headers: NO_STORE })
}

function fail(req: NextRequest, code: string) {
  const res = redirectTo(req, `/auth/login?error=${code}`)
  res.cookies.delete({ name: 'gf_google_state', path: '/api/auth/google' })
  return res
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

/** Indexed lookup first (same index signup writes), then a bounded scan. */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<User | null> {
  try {
    const indexedId = await redis.get<string>(ownerRegistrationIndexKey(email))
    if (indexedId) {
      const { data } = await admin.auth.admin.getUserById(indexedId)
      if (data?.user?.email?.toLowerCase() === email) return data.user
    }
  } catch {
    // Index is an optimisation; fall through to the scan.
  }

  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < 1000) break
  }
  return null
}

/**
 * GET /api/auth/google/callback
 *
 * Finishes the flow started by /start. Every failure redirects to
 * /auth/login?error=<code>; the real reason is logged server-side only.
 */
export async function GET(req: NextRequest) {
  const log = apiLogger('auth/google/callback')
  try {
    const params = req.nextUrl.searchParams
    if (params.get('error')) {
      log.info('google returned an error', { error: params.get('error') })
      return fail(req, 'google_cancelled')
    }

    const code = params.get('code')
    const state = params.get('state')
    const cookieState = req.cookies.get('gf_google_state')?.value
    if (!code || !state || !cookieState || state !== cookieState) {
      log.warn('state missing or mismatched')
      return fail(req, 'google_state')
    }

    // Single use: delete before anything else so a replayed callback finds nothing.
    const stateKey = `google-oauth:${state}`
    const stored = await redis.get<{ nonce?: string; codeVerifier?: string }>(stateKey)
    await redis.del(stateKey)
    if (!stored?.nonce || !stored?.codeVerifier) {
      log.warn('state not found or expired')
      return fail(req, 'google_state')
    }

    // Must equal the redirect_uri that /start sent to Google, so it comes from the same place.
    const origin = req.nextUrl.origin
    const redirectUri = `${origin}/api/auth/google/callback`

    const idToken = await exchangeGoogleCode({ code, codeVerifier: stored.codeVerifier, redirectUri })
    const identity = await verifyGoogleIdToken(idToken, { nonce: stored.nonce })
    const maskedEmail = maskEmail(identity.email)

    const admin = createAdminClient()
    let user = await findAuthUserByEmail(admin, identity.email)

    let isMember = false
    if (user) {
      const { data: memberRow, error: memberError } = await admin
        .from('members')
        .select('id')
        .eq('auth_user_id', user.id)
        .limit(1)
        .maybeSingle()
      if (memberError) throw new Error(`member lookup failed: ${memberError.message}`)
      isMember = Boolean(memberRow) || hasMemberIdentityMarker(user)
    }

    const decision = decideGoogleSignIn({ existingUser: Boolean(user), isMember, hasGym: false })
    if (decision === 'reject_member') {
      log.warn('member account rejected', { email: maskedEmail })
      return fail(req, 'google_member')
    }

    if (decision === 'create_owner') {
      const { data, error } = await admin.auth.admin.createUser({
        email: identity.email,
        email_confirm: true, // Google has verified the address
        password: crypto.randomUUID(), // never used; sign-in is via Google
        user_metadata: {
          full_name: identity.name ?? undefined,
          name: identity.name ?? undefined,
          auth_provider: 'google',
        },
        app_metadata: { [OWNER_REGISTRATION_METADATA_KEY]: OWNER_REGISTRATION_METADATA_VALUE },
      })
      if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? 'no user'}`)
      user = data.user

      try {
        await redis.set(ownerRegistrationIndexKey(identity.email), user.id, {
          ex: OWNER_REGISTRATION_INDEX_TTL_SECONDS,
        })
      } catch (indexError) {
        log.warn('failed to index owner registration', { error: String(indexError) })
      }
    }

    if (!user) throw new Error('no user after decision')

    const { data: gym, error: gymError } = await admin
      .from('gyms')
      .select('is_active, onboarding_completed')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (gymError) throw new Error(`gym lookup failed: ${gymError.message}`)
    if (gym?.is_active === false) {
      log.warn('suspended gym blocked', { email: maskedEmail })
      return fail(req, 'google_failed')
    }

    // Same pattern as /api/activate/redeem: redeem a magiclink token_hash on the
    // request-scoped client so the session cookies are written by Supabase SSR.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: identity.email,
    })
    const tokenHash = link?.properties?.hashed_token
    if (linkError || !tokenHash) throw new Error(`generateLink failed: ${linkError?.message ?? 'no token'}`)

    const supabase = await createClient()
    const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (otpError) throw new Error(`verifyOtp failed: ${otpError.message}`)

    const target = !gym
      ? '/auth/add-phone'
      : gym.onboarding_completed
        ? '/owner/dashboard'
        : '/owner/onboarding'

    log.info('google sign-in ok', { email: maskedEmail, decision })
    const res = redirectTo(req, target)
    res.cookies.delete({ name: 'gf_google_state', path: '/api/auth/google' })
    return res
  } catch (err) {
    if (err instanceof GoogleConfigError) {
      log.error('google not configured', err)
      return fail(req, 'google_unavailable')
    }
    log.error('callback failed', err)
    return fail(req, 'google_failed')
  }
}
