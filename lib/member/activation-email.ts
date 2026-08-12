/**
 * lib/activation-email.ts
 *
 * Sends the member's email-verification link.
 *
 * Shared by /api/activate/complete and /api/activate/resend so both agree on
 * the redirect target and on how Supabase's rate limits are reported.
 */

import { createClient } from '@supabase/supabase-js'
import { memberAppOrigin } from '@/lib/member/redirect'

export type SendResult =
  | { ok: true }
  /** Supabase throttled us. `retryAfterSeconds` is best-effort. */
  | { ok: false; kind: 'rate_limited'; retryAfterSeconds: number; message: string }
  | { ok: false; kind: 'failed'; message: string }

function getAnonSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration')
  // No session persistence: this client exists only to trigger the email.
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

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
  const supabase = getAnonSupabase()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${getMemberAppUrl()}/api/activate/callback`,
    },
  })

  if (error) {
    console.error('[activation-email] send failed:', error.message)
    return classify(error.message)
  }
  return { ok: true }
}
