import { NextRequest } from 'next/server'
import { withAuth, apiError, apiSuccess } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/delete-gym/request-otp
 *
 * Step 1 of the two-step account deletion. Emails a 6-digit reauthentication
 * OTP to the owner's registered email so the destructive delete can be gated on
 * proof of email control rather than just typing the gym name.
 *
 * Uses `supabase.auth.reauthenticate()`, which:
 *   - sends the code using the project's **Reauthentication** email template
 *     (delivered through whatever SMTP/Resend the Supabase project is wired to),
 *   - targets the currently signed-in user's own confirmed email — the address
 *     is taken from the session, never from the request body,
 *   - does NOT create or replace a session, which is exactly what a
 *     confirm-sensitive-action flow needs (unlike signInWithOtp).
 *
 * The matching nonce is later redeemed by the delete route via
 * `verifyOtp({ type: 'reauthentication' })` on this same session.
 *
 * Rate limited hard: this sends real email, and Supabase itself caps auth emails
 * per hour, so a low per-user cap keeps us well under that and blocks abuse.
 */
export const POST = withAuth(
  'ACCOUNT_DELETE_REQUEST_OTP',
  async (_req: NextRequest, ctx) => {
    const { supabase, user, log } = ctx

    if (!user.email) {
      // Owner has no confirmed email on file — cannot verify by email.
      return apiError(
        400,
        'NO_EMAIL',
        'Your account has no verified email, so we cannot send a confirmation code. Please contact support.',
      )
    }

    const { error } = await supabase.auth.reauthenticate()

    if (error) {
      log.error('Failed to send reauthentication OTP', error)
      // Generic message — do not surface GoTrue internals to the client.
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
  // A handful per minute is plenty for a human confirming a deletion, and stays
  // well under Supabase's hourly auth-email cap.
  { rateLimit: 4 },
)

/** "ganesh@example.com" -> "ga****@example.com" for display only. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const shown = local.slice(0, 2)
  return `${shown}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`
}
