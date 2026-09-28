import { NextRequest } from 'next/server'
import { withAuth, apiError, apiSuccess } from '@/lib/api/withAuth'
import { issueDeleteOtp, DELETE_OTP_EXPIRY_LABEL } from '@/lib/account/delete-otp'
import { sendDeleteAccountOtp } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/delete-gym/request-otp
 *
 * Step 1 of the two-step account deletion. Emails a 6-digit verification code
 * to the owner's registered email so the destructive delete can be gated on
 * proof of email control rather than just typing the gym name.
 *
 * ─── App-owned code, not a Supabase nonce ────────────────────────────────────
 * This used to call `supabase.auth.reauthenticate()`, whose code is a nonce
 * bound to the session. A token refresh between requesting and verifying
 * invalidated it, so a correct code failed as `otp_expired`. We now mint the
 * code ourselves (`issueDeleteOtp`), store its hash in Redis with a short TTL,
 * and email it via Resend. The delete route verifies the typed code against
 * that store — no session dependency, no refresh race.
 *
 * The email address is taken from the session, never from the request body.
 * Requesting again issues a brand-new code (and burns the old one).
 *
 * Rate limited hard: this sends real email, so a low per-user cap blocks abuse.
 */
export const POST = withAuth(
  'ACCOUNT_DELETE_REQUEST_OTP',
  async (_req: NextRequest, ctx) => {
    const { user, log } = ctx

    if (!user.email) {
      // Owner has no confirmed email on file — cannot verify by email.
      return apiError(
        400,
        'NO_EMAIL',
        'Your account has no verified email, so we cannot send a confirmation code. Please contact support.',
      )
    }

    // Mint + store the code, then email it. If the email fails we surface a
    // generic error; the (now-stored) code simply expires unused.
    const code = await issueDeleteOtp(user.id)
    const sent = await sendDeleteAccountOtp(user.email, code, DELETE_OTP_EXPIRY_LABEL)

    if (!sent.ok) {
      log.error('Failed to send deletion OTP email', { message: sent.message })
      return apiError(
        500,
        'OTP_SEND_FAILED',
        'We could not send the confirmation code right now. Please try again in a moment.',
      )
    }

    // Echo the (masked) destination so the UI can say where the code went,
    // without exposing the full address in any new place.
    return apiSuccess({ sent: true, email: maskEmail(user.email) })
  },
  // A handful per minute is plenty for a human confirming a deletion.
  { rateLimit: 4 },
)

/** "ganesh@example.com" -> "ga****@example.com" for display only. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const shown = local.slice(0, 2)
  return `${shown}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`
}
