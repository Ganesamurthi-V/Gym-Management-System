import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { reportAlertInBackground } from '@/lib/monitoring/alert'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  OWNER_REGISTRATION_INDEX_TTL_SECONDS,
  ownerRegistrationAppMetadata,
  ownerRegistrationIndexKey,
} from '@/lib/auth/owner-registration'
import { setupPasswordLinkFromHashedToken } from '@/lib/auth/email-links'
import { sendSetPasswordEmail } from '@/lib/email/resend'
import { normalizeIndianMobile } from '@/lib/auth/phone'
import { recordPhoneLead } from '@/lib/auth/phone-leads'
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
 * Body: { email, fullName, mobileNumber, marketingConsent? }. The mobile number is required and
 * saved unverified.
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

    let body: { email?: string; fullName?: string; mobileNumber?: string; marketingConsent?: unknown }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { email, fullName, mobileNumber, marketingConsent } = body

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    }

    const mobileE164 = typeof mobileNumber === 'string' ? normalizeIndianMobile(mobileNumber) : null
    if (!mobileE164) {
      return NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const redirectUrl = `${(process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')}/auth/setup-password`

    // Create the account AND mint the confirmation token in one admin call,
    // WITHOUT Supabase sending an email — we send it ourselves via Resend below.
    //
    // `generateLink({ type: 'signup' })` returns `properties.hashed_token`, a
    // plain (non-PKCE) one-time token that verifyOtp() can redeem from any
    // device. That is why this replaced supabase.auth.signUp on the implicit
    // client: we no longer depend on Supabase's email delivery or its dashboard
    // template, and we still get a redeemable token-hash link.
    const admin = createAdminClient()
    const { data, error: linkError } = await admin.auth.admin.generateLink({
      type: 'signup',
      email: normalizedEmail,
      password: crypto.randomUUID(), // random; the owner sets theirs via the email link
      options: {
        data: {
          full_name: fullName.trim(),
          name: fullName.trim(),
          mobile_number: mobileE164,
        },
        redirectTo: redirectUrl,
      },
    })

    if (linkError) {
      const msg = linkError.message.toLowerCase()
      if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('email exists')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Try signing in instead.', code: 'ALREADY_EXISTS' },
          { status: 409 },
        )
      }
      logger.error('[auth/signup] generateLink failed:', { error: linkError.message })
      // Handled failures are invisible to Sentry; page via the central alert (deduped by key).
      reportAlertInBackground({ key: 'auth:signup_error', severity: 'critical', title: 'auth:signup_error failure', body: `auth/signup failed: ${String(linkError.message).slice(0, 300)}` })
      const rateLimited = /rate|wait|too many/i.test(linkError.message)
      return NextResponse.json(
        {
          error: rateLimited
            ? 'Too many signup attempts. Please wait a few minutes and try again.'
            : 'We could not create your account right now. Please try again.',
        },
        { status: rateLimited ? 429 : 400 },
      )
    }

    const hashedToken = data?.properties?.hashed_token
    if (!data?.user || !hashedToken) {
      console.error('[auth/signup] generateLink returned no user/token')
      return NextResponse.json(
        { error: 'We could not create your account right now. Please try again.' },
        { status: 500 },
      )
    }

    // Mark owner registration in server-controlled app_metadata. Finalization
    // requires this marker (or a tightly checked legacy owner record), so a
    // confirmed member session can never create a gym through this flow.
    const { error: markerError } = await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: ownerRegistrationAppMetadata(data.user),
    })

    if (markerError) {
      logger.error('[auth/signup] failed to mark owner registration:', { error: markerError.message })
      // Handled failures are invisible to Sentry; page via the central alert (deduped by key).
      reportAlertInBackground({ key: 'auth:signup_error', severity: 'critical', title: 'auth:signup_error failure', body: `auth/signup failed: ${String(markerError.message).slice(0, 300)}` })
      const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id)
      if (cleanupError) {
        logger.error('[auth/signup] failed to roll back unmarked user:', { error: cleanupError.message })
        // Handled failures are invisible to Sentry; page via the central alert (deduped by key).
        reportAlertInBackground({ key: 'auth:signup_error', severity: 'critical', title: 'auth:signup_error failure', body: `auth/signup failed: ${String(cleanupError.message).slice(0, 300)}` })
      }
      return NextResponse.json(
        { error: 'We could not create your account right now. Please try again.' },
        { status: 500 },
      )
    }

    // Send the "set your password" email via Resend. If delivery fails, roll the
    // account back so the owner can retry cleanly rather than being stuck with a
    // confirmed-less account and no email.
    const sent = await sendSetPasswordEmail(
      normalizedEmail,
      setupPasswordLinkFromHashedToken(hashedToken, 'signup', req.nextUrl.origin),
    )
    if (!sent.ok) {
      logger.error('[auth/signup] set-password email failed:', { error: sent.message })
      // Handled failures are invisible to Sentry; page via the central alert (deduped by key).
      reportAlertInBackground({ key: 'auth:signup_error', severity: 'critical', title: 'auth:signup_error failure', body: `auth/signup failed: ${String(sent.message).slice(0, 300)}` })
      const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id)
      if (cleanupError) {
        logger.error('[auth/signup] failed to roll back after email failure:', { error: cleanupError.message })
        // Handled failures are invisible to Sentry; page via the central alert (deduped by key).
        reportAlertInBackground({ key: 'auth:signup_error', severity: 'critical', title: 'auth:signup_error failure', body: `auth/signup failed: ${String(cleanupError.message).slice(0, 300)}` })
      }
      return NextResponse.json(
        { error: 'We could not send your confirmation email right now. Please try again.' },
        { status: 502 },
      )
    }

    // Marketing-list record after the account is final (not rolled back). Best effort, never throws, so it cannot change this
    // route's result.
    await recordPhoneLead({
      phoneE164: mobileE164,
      email: normalizedEmail,
      fullName: fullName.trim(),
      userId: data.user.id,
      consent: typeof marketingConsent === 'boolean' ? marketingConsent : null,
    })

    // Best-effort indexed lookup for cross-device resends. The key is a SHA-256
    // digest of the address, not the email itself. A legacy admin lookup remains
    // available if Redis is temporarily unavailable.
    try {
      await redis.set(ownerRegistrationIndexKey(normalizedEmail), data.user.id, {
        ex: OWNER_REGISTRATION_INDEX_TTL_SECONDS,
      })
    } catch (indexError) {
      logger.warn('[auth/signup] failed to index owner registration:', { error: indexError instanceof Error ? indexError.message : String(indexError) })
      reportAlertInBackground({ key: 'auth:signup_index_error', severity: 'warning', title: 'Signup Redis index failed', body: 'Owner registration index write failed; cross-device resend falls back to admin lookup.' })
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    logger.error('[auth/signup] unexpected error:', { error: error instanceof Error ? error.message : String(error) })
    // Handled failures are invisible to Sentry; page via the central alert (deduped by key).
    reportAlertInBackground({ key: 'auth:signup_error', severity: 'critical', title: 'auth:signup_error failure', body: `auth/signup failed: ${String(error instanceof Error ? error.message : String(error)).slice(0, 300)}` })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
