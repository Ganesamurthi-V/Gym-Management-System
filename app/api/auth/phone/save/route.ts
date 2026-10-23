import { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasMemberIdentityMarker } from '@/lib/auth/owner-registration'
import { maskIndianMobile, normalizeIndianMobile } from '@/lib/auth/phone'
import { recordPhoneLead } from '@/lib/auth/phone-leads'
import { clientIp, requirePhoneRouteUser } from '@/lib/auth/phone-route'

export const dynamic = 'force-dynamic'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const limiter = (prefix: string) =>
  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '10 m'), prefix: `ratelimit:${prefix}` })

const ipLimiter = limiter('phone-save-ip')
const userLimiter = limiter('phone-save-user')

/**
 * POST /api/auth/phone/save  { mobileNumber, marketingConsent? }
 * Saves the signed-in new owner's mobile number in their auth metadata. The number is only
 * collected, never verified, and may be shared by several owner accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePhoneRouteUser(req, { csrf: true })
    if ('response' in auth) return auth.response
    const { user } = auth

    const checks = await Promise.all([ipLimiter.limit(clientIp(req)), userLimiter.limit(user.id)])
    const blocked = checks.find(c => !c.success)
    if (blocked) {
      const seconds = Math.max(1, Math.ceil((blocked.reset - Date.now()) / 1000))
      const res = apiError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.')
      res.headers.set('Retry-After', String(seconds))
      return res
    }

    let mobile: unknown
    let consent: unknown
    try {
      const body = (await req.json()) as { mobileNumber?: unknown; marketingConsent?: unknown }
      mobile = body?.mobileNumber
      consent = body?.marketingConsent
    } catch { /* fails below */ }
    const phone = typeof mobile === 'string' ? normalizeIndianMobile(mobile) : null
    if (!phone) {
      return apiError(400, 'INVALID_PHONE', 'Enter a valid 10-digit mobile number.')
    }

    const admin = createAdminClient()

    // Same eligibility as finalize-registration: a member login must not become an owner.
    const { data: memberIdentity, error: memberError } = await admin
      .from('members')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (memberError) {
      console.error('[auth/phone/save] member lookup failed:', memberError.message)
      return apiError(500, 'DATABASE_ERROR', 'We could not save your number. Please try again.')
    }
    if (memberIdentity?.id || hasMemberIdentityMarker(user)) {
      return apiError(403, 'FORBIDDEN', 'This account cannot be used to create a gym owner profile.')
    }

    // Merge: updateUserById replaces user_metadata wholesale, so keep the existing keys.
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, mobile_number: phone },
    })
    if (updateError) {
      console.error('[auth/phone/save] metadata update failed:', updateError.message)
      return apiError(500, 'INTERNAL_ERROR', 'We could not save your number. Please try again.')
    }

    // Best effort marketing-list record: never throws.
    const meta = user.user_metadata as { full_name?: unknown; name?: unknown } | undefined
    const fullName = [meta?.full_name, meta?.name].find((v): v is string => typeof v === 'string' && v.trim() !== '')
    await recordPhoneLead({
      phoneE164: phone,
      email: user.email ?? null,
      fullName: fullName?.trim() ?? null,
      userId: user.id,
      consent: typeof consent === 'boolean' ? consent : null,
    })

    return apiSuccess({ maskedPhone: maskIndianMobile(phone) })
  } catch (err) {
    console.error('[auth/phone/save] unexpected error:', err)
    return apiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
  }
}
