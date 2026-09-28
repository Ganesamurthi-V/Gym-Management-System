/**
 * lib/activation-email.ts
 *
 * Sends the member's email-verification link.
 *
 * Shared by /api/activate/complete and /api/activate/resend so both agree on
 * the redirect target and on how Supabase's rate limits are reported.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { memberAppOrigin } from '@/lib/member/redirect'
import { sendConfirmEmail } from '@/lib/email/resend'

export type SendResult =
  | { ok: true }
  /** Supabase throttled us. `retryAfterSeconds` is best-effort. */
  | { ok: false; kind: 'rate_limited'; retryAfterSeconds: number; message: string }
  | { ok: false; kind: 'failed'; message: string }

/**
 * Where the emailed link lands.
 *
 * A CLIENT page, deliberately. The one-time token now travels in the URL
 * fragment (`#token_hash=...`), and a fragment is never transmitted in an HTTP
 * request — only page JavaScript can read it. That is what makes the link
 * immune to mail scanners, but it also means a server route could never see it.
 *
 * This used to be `/api/activate/callback`, which forced the template to use
 * `{{ .ConfirmationURL }}` — a Supabase-hosted URL that redeems the token on ANY
 * GET, including the automatic fetches performed by mail scanners and link
 * previewers. That is what made activation links appear to expire seconds after
 * they arrived.
 *
 * `/api/activate/callback` is intentionally left in place: links already sitting
 * in members' inboxes still point at it, and it forwards to this same page.
 */
export const ACTIVATION_LANDING_PATH = '/activate/verifying'

/**
 * Canonical public origin for member-facing links.
 *
 * After the unified-app migration the member experience is served from
 * `app.gymflow.sbs/m/*`, not `member.gymflow.sbs`. `NEXT_PUBLIC_APP_URL` is
 * the single source of truth; `NEXT_PUBLIC_MEMBER_APP_URL` is still read first
 * so an existing deployment that sets it keeps working, but it should be
 * removed once `member.gymflow.sbs` is retired.
 */
export function getMemberAppUrl(): string {
  return memberAppOrigin()
}

/**
 * Supabase enforces a minimum interval between OTP/magic-link emails per
 * address (60s by default) plus an hourly cap. Those come back as a generic
 * error string, which the old code surfaced verbatim as
 * "Failed to send verification email: ..." — indistinguishable from a real
 * failure, and with no way for the member to recover.
 */
function classify(message: string): SendResult {
  const lower = message.toLowerCase()

  const isRateLimit =
    lower.includes('security purposes') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('over_email_send_rate_limit')

  if (isRateLimit) {
    const seconds = Number(message.match(/(\d+)\s*second/i)?.[1] ?? 60)
    return {
      ok: false,
      kind: 'rate_limited',
      retryAfterSeconds: Number.isFinite(seconds) ? seconds : 60,
      message: `Please wait ${seconds} seconds before requesting another email.`,
    }
  }

  return { ok: false, kind: 'failed', message }
}

/**
 * Sends the verification email to `email`.
 *
 * `shouldCreateUser: false` because the auth identity already exists — the owner
 * app created it when the invitation was sent.
 */
export async function sendVerificationEmail(email: string): Promise<SendResult> {
  // Mint the magic-link token WITHOUT Supabase sending an email, then deliver it
  // via Resend. `generateLink({ type: 'magiclink' })` returns a plain (non-PKCE)
  // `hashed_token` — the same reason the owner flows moved off signInWithOtp on
  // the implicit client. `shouldCreateUser` is not needed: the auth identity
  // already exists (the owner app created it when the invitation was sent), and
  // magiclink generateLink does not create users.
  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${getMemberAppUrl()}${ACTIVATION_LANDING_PATH}`,
    },
  })

  if (error) {
    console.error('[activation-email] generateLink failed:', error.message)
    return classify(error.message)
  }

  const hashedToken = data?.properties?.hashed_token
  if (!hashedToken) {
    console.error('[activation-email] generateLink returned no token')
    return { ok: false, kind: 'failed', message: 'Could not prepare the verification link.' }
  }

  // The verifying page reads `#token_hash=…&type=magiclink` from the URL
  // fragment (a fragment is never sent in an HTTP request, so mail scanners
  // cannot consume the one-time token). Keep that exact shape.
  const actionUrl =
    `${getMemberAppUrl()}${ACTIVATION_LANDING_PATH}` +
    `#token_hash=${encodeURIComponent(hashedToken)}&type=magiclink`

  const sent = await sendConfirmEmail(email, actionUrl)
  if (!sent.ok) {
    console.error('[activation-email] send failed:', sent.message)
    return classify(sent.message)
  }
  return { ok: true }
}
