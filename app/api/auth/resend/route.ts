import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  OWNER_REGISTRATION_INDEX_TTL_SECONDS,
  hasLegacyOwnerSignupMetadata,
  hasMemberIdentityMarker,
  hasOwnerRegistrationMarker,
  ownerRegistrationAppMetadata,
  ownerRegistrationIndexKey,
} from '@/lib/auth/owner-registration'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const resendLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '5 m'),
  prefix: 'ratelimit:resend',
})

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const
const NEGATIVE_INDEX_VALUE = 'none'
const NEGATIVE_INDEX_TTL_SECONDS = 15 * 60
const LEGACY_LOOKUP_MAX_PAGES = 10

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createAdminClient()
  const indexKey = ownerRegistrationIndexKey(email)

  const indexedUserId = await redis.get<string>(indexKey)
  if (indexedUserId === NEGATIVE_INDEX_VALUE) return null

  if (indexedUserId) {
    const { data, error } = await admin.auth.admin.getUserById(indexedUserId)
    if (!error && data.user?.email?.toLowerCase() === email) return data.user
    await redis.del(indexKey)
  }

  // Compatibility path for owner signups created before the Redis index. New
  // signups are O(1); misses are negatively cached so anonymous requests cannot
  // repeatedly scan the Auth directory.
  for (let page = 1; page <= LEGACY_LOOKUP_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email)
    if (user) return user
    if (data.users.length < 1000) break
  }

  await redis.set(indexKey, NEGATIVE_INDEX_VALUE, { ex: NEGATIVE_INDEX_TTL_SECONDS })
  return null
}

async function isEligibleOwnerIdentity(user: User): Promise<boolean> {
  const admin = createAdminClient()

  const [memberResult, gymResult] = await Promise.all([
    admin.from('members').select('id').eq('auth_user_id', user.id).maybeSingle(),
    admin.from('gyms').select('id').eq('owner_id', user.id).maybeSingle(),
  ])

  if (memberResult.error) throw memberResult.error
  if (gymResult.error) throw gymResult.error

  if (memberResult.data?.id || hasMemberIdentityMarker(user)) return false
  if (gymResult.data?.id || hasOwnerRegistrationMarker(user)) return true

  // Promote pre-marker owner signups only after proving they are not linked to
  // a member row. The marker then becomes server-authoritative for later calls.
  if (hasLegacyOwnerSignupMetadata(user)) {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: ownerRegistrationAppMetadata(user),
    })
    if (error) throw error
    return true
  }

  return false
}

/**
 * POST /api/auth/resend
 *
 * Sends a confirmation email for a pending owner, or a recovery email when an
 * email scanner already confirmed that owner. Member identities are rejected
 * server-side and the public response never reveals whether an address exists.
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
        {
          status: 429,
          headers: {
            ...NO_STORE,
            'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          },
        },
      )
    }

    let body: { email?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: NO_STORE })
    }

    let { email } = body
    if (!email) {
      try {
        const supabaseForSession = await createClient()
        const { data } = await supabaseForSession.auth.getUser()
        email = data.user?.email
      } catch {
        // The manual email field remains available when no session can help.
      }
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400, headers: NO_STORE })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
    const redirectUrl = `${appOrigin}/auth/setup-password`

    try {
      const user = await findAuthUserByEmail(normalizedEmail)
      if (user && await isEligibleOwnerIdentity(user)) {
        await redis.set(ownerRegistrationIndexKey(normalizedEmail), user.id, {
          ex: OWNER_REGISTRATION_INDEX_TTL_SECONDS,
        })

        const supabase = await createClient()
        const result = user.email_confirmed_at
          ? await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: redirectUrl })
          : await supabase.auth.resend({
              type: 'signup',
              email: normalizedEmail,
              options: { emailRedirectTo: redirectUrl },
            })

        if (result.error) {
          // Provider state, account existence, and cooldowns remain server-side.
          // The application-owned limiter above is the only public 429 signal.
          console.error('[auth/resend] email delivery failed:', result.error.message)
        }
      }
    } catch (error) {
      // Keep account classification and infrastructure failures indistinguishable
      // to the caller. Operational details are available in server logs.
      console.error('[auth/resend] owner recovery lookup failed:', error)
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (error) {
    console.error('[auth/resend] unexpected error:', error)
    return NextResponse.json(
      { error: 'We could not process this request right now. Please try again.' },
      { status: 500, headers: NO_STORE },
    )
  }
}
