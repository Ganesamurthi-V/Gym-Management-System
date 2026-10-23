import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasMemberIdentityMarker } from '@/lib/auth/owner-registration'
import { issuePhoneOtp, clearPhoneOtp } from '@/lib/auth/phone-otp'
import { maskIndianMobile, normalizeIndianMobile } from '@/lib/auth/phone'
import { recordPhoneLead } from '@/lib/auth/phone-leads'
import { clientIp, requirePhoneRouteUser } from '@/lib/auth/phone-route'
import { sendAuthOtp } from '@/services/whatsapp/graph'

export const dynamic = 'force-dynamic'

const RESEND_SECONDS = 30

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const limiter = (n: number, window: '10 m' | '1 h', prefix: string) =>
  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(n, window), prefix: `ratelimit:${prefix}` })

const ipLimiter = limiter(5, '10 m', 'phone-otp-ip')
const userLimiter = limiter(5, '10 m', 'phone-otp-user')
// Keyed by a hash of the number so one victim's WhatsApp cannot be flooded from many accounts.
const phoneLimiter = limiter(3, '1 h', 'phone-otp-phone')

function rateLimited(retryAfter: number, message: string) {
  const seconds = Math.max(1, retryAfter)
  return NextResponse.json(
    { success: false, error: { code: 'RATE_LIMITED', message }, resendInSeconds: seconds },
    { status: 429, headers: { 'Retry-After': String(seconds), 'Cache-Control': 'private, no-store' } },
  )
}

/**
 * POST /api/auth/phone/request-otp  { mobileNumber }
 * Sends a 6-digit WhatsApp code proving the signed-in new owner controls the number.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePhoneRouteUser(req, { csrf: true })
    if ('response' in auth) return auth.response
    const { user } = auth

    let mobile: unknown
    let consent: unknown
    try {
      const body = (await req.json()) as { mobileNumber?: unknown; marketingConsent?: unknown }
      mobile = body?.mobileNumber
      consent = body?.marketingConsent
    } catch { /* fails below */ }
    const phone = typeof mobile === 'string' ? normalizeIndianMobile(mobile) : null
    if (!phone) {
      return apiError(400, 'INVALID_PHONE', 'Enter a valid 10-digit Indian mobile number.')
    }

    // Remembered before any step that can reject (in use, rate limit, send failure) so the number
    // is kept even when the code never goes out. Best effort: never throws.
    const meta = user.user_metadata as { full_name?: unknown; name?: unknown } | undefined
    const fullName = [meta?.full_name, meta?.name].find((v): v is string => typeof v === 'string' && v.trim() !== '')
    await recordPhoneLead({
      phoneE164: phone,
      email: user.email ?? null,
      fullName: fullName?.trim() ?? null,
      userId: user.id,
      consent: typeof consent === 'boolean' ? consent : null,
    })

    const admin = createAdminClient()

    // Same eligibility as finalize-registration: a member login must not become an owner.
    const { data: memberIdentity, error: memberError } = await admin
      .from('members')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (memberError) {
      console.error('[auth/phone/request-otp] member lookup failed:', memberError.message)
      return apiError(500, 'DATABASE_ERROR', 'We could not send the code. Please try again.')
    }
    if (memberIdentity?.id || hasMemberIdentityMarker(user)) {
      return apiError(403, 'FORBIDDEN', 'This account cannot be used to create a gym owner profile.')
    }

    const { data: taken, error: takenError } = await admin
      .from('owner_verified_phones')
      .select('user_id')
      .eq('phone_e164', phone)
      .neq('user_id', user.id)
      .maybeSingle()
    if (takenError) {
      console.error('[auth/phone/request-otp] phone lookup failed:', takenError.message)
      return apiError(500, 'DATABASE_ERROR', 'We could not send the code. Please try again.')
    }
    if (taken) {
      return apiError(409, 'PHONE_IN_USE', 'This mobile number is already linked to another account.')
    }

    // Cooldown first so a double-tap does not burn the hourly per-phone budget.
    const cooldownKey = `phone-otp:cooldown:${user.id}`
    const gotSlot = await redis.set(cooldownKey, '1', { nx: true, ex: RESEND_SECONDS })
    if (!gotSlot) {
      const ttl = await redis.ttl(cooldownKey)
      return rateLimited(ttl > 0 ? ttl : RESEND_SECONDS, 'Please wait before requesting another code.')
    }

    const phoneHash = createHash('sha256').update(phone).digest('hex')
    const checks = await Promise.all([
      ipLimiter.limit(clientIp(req)),
      userLimiter.limit(user.id),
      phoneLimiter.limit(phoneHash),
    ])
    const blocked = checks.find(c => !c.success)
    if (blocked) {
      return rateLimited(Math.ceil((blocked.reset - Date.now()) / 1000), 'Too many code requests. Please try again later.')
    }

    const code = await issuePhoneOtp(user.id, phone)
    const sent = await sendAuthOtp(phone, code)
    if (!sent.success) {
      await clearPhoneOtp(user.id)
      await redis.del(cooldownKey)
      if (sent.deferred) {
        console.error('[auth/phone/request-otp] WhatsApp daily recipient limit reached', { phone: maskIndianMobile(phone) })
        return apiError(503, 'OTP_TEMPORARILY_UNAVAILABLE', 'We cannot send codes right now. Please try again in a little while.')
      }
      console.error('[auth/phone/request-otp] WhatsApp send failed', { phone: maskIndianMobile(phone), ambiguous: sent.ambiguous })
      return apiError(
        502,
        'OTP_SEND_FAILED',
        sent.ambiguous
          ? 'We could not confirm the code was delivered. Wait 30 seconds, then tap Resend. Resend sends a new code and the old one stops working.'
          : 'We could not send the code to this number on WhatsApp. Check the number and try again.',
      )
    }

    return apiSuccess({ maskedPhone: maskIndianMobile(phone), resendInSeconds: RESEND_SECONDS })
  } catch (err) {
    console.error('[auth/phone/request-otp] unexpected error:', err)
    return apiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
  }
}
