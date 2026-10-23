import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPhoneOtp } from '@/lib/auth/phone-otp'
import { markPhoneLeadVerified } from '@/lib/auth/phone-leads'
import { requirePhoneRouteUser } from '@/lib/auth/phone-route'

export const dynamic = 'force-dynamic'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const verifyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '5 m'),
  prefix: 'ratelimit:phone-verify',
})

/**
 * POST /api/auth/phone/verify  { code }
 * On a correct code, records the number the code was issued for against this user.
 * The phone comes from the server-side store, never from the request.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePhoneRouteUser(req, { csrf: true })
    if ('response' in auth) return auth.response
    const { user } = auth

    const { success, reset } = await verifyLimiter.limit(user.id)
    if (!success) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a moment and try again.' } },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) } },
      )
    }

    let code: unknown
    try { code = ((await req.json()) as { code?: unknown })?.code } catch { /* fails the check below */ }
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      return apiError(400, 'INVALID_OTP', 'Enter the 6-digit code sent to your WhatsApp.')
    }

    const result = await verifyPhoneOtp(user.id, code.trim())
    if (!result.ok) {
      if (result.reason === 'too_many_attempts') {
        return apiError(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code and try again.')
      }
      // 'expired' also means a newer code replaced this one (every Send/Resend issues a new code).
      return apiError(
        400,
        'INVALID_OTP',
        result.reason === 'expired'
          ? 'No active code found. It may have expired, or a newer code was sent. Use the latest code, or request a new one.'
          : 'That code does not match. Check the latest WhatsApp message and try again.',
      )
    }

    const { error } = await createAdminClient()
      .from('owner_verified_phones')
      .upsert({ user_id: user.id, phone_e164: result.phone, verified_at: new Date().toISOString() }, { onConflict: 'user_id' })

    if (error) {
      // 23505 on phone_e164: another owner verified this number between request-otp and now.
      if (error.code === '23505') {
        return apiError(409, 'PHONE_IN_USE', 'This mobile number is already linked to another account.')
      }
      console.error('[auth/phone/verify] upsert failed:', error.message)
      return apiError(500, 'DATABASE_ERROR', 'We could not save your verification. Please request a new code.')
    }

    await markPhoneLeadVerified(result.phone, user.id)

    return apiSuccess({ verified: true })
  } catch (err) {
    console.error('[auth/phone/verify] unexpected error:', err)
    return apiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
  }
}
