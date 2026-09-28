import 'server-only'

import { Resend } from 'resend'

/**
 * lib/email/resend.ts
 * ───────────────────
 * Single entry point for transactional email, sent through Resend published
 * Templates instead of Supabase Auth's built-in email.
 *
 * ─── Why Resend and not Supabase templates ───────────────────────────────────
 * Supabase Auth owned the email body (its dashboard templates) AND the token.
 * That coupling caused two problems we hit:
 *   • the account-deletion code was a reauthentication *nonce* bound to the
 *     session, so a token refresh between "send" and "verify" made a correct
 *     code fail as `otp_expired`; and
 *   • the OTP length / template copy lived in a dashboard, out of version
 *     control.
 * Moving the *body* to Resend templates (created via the Resend CLI, aliases
 * below) lets the app own copy and — for deletion — mint and verify its own
 * code. Link-based emails (signup, member activation) still need Supabase to
 * mint a redeemable token, so those flows call `admin.auth.admin.generateLink`
 * to get the link WITHOUT Supabase emailing it, then send it through here.
 *
 * ─── Template variables ──────────────────────────────────────────────────────
 * Resend templates use triple-brace `{{{var}}}` placeholders. The variable keys
 * below must match exactly what each published template declares.
 */

/** Published Resend template aliases (see `resend templates list`). */
export const EMAIL_TEMPLATES = {
  setPassword: 'gymflow-set-password',
  confirmEmail: 'gymflow-confirm-email',
  deleteAccountOtp: 'gymflow-delete-account-otp',
} as const

let client: Resend | null = null

/**
 * Lazily construct the Resend client so a missing key throws only when an email
 * is actually sent, not at module import (which would break unrelated routes).
 */
function getResend(): Resend {
  if (client) return client
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set. Add it to .env.local and the Vercel environment.',
    )
  }
  client = new Resend(apiKey)
  return client
}

/** Sender address — must be on a domain verified in Resend. */
function getFrom(): string {
  const from = process.env.RESEND_FROM
  if (!from) {
    throw new Error(
      'RESEND_FROM is not set. Use an address on a Resend-verified domain, e.g. "GymFlow <noreply@gymflow.sbs>".',
    )
  }
  return from
}

// The logo is NOT passed from here. Each published template declares its own
// `logo_url` fallback (owner templates use the landscape lockup; the member
// confirm-email template uses the members mark), so the correct logo per
// template is baked into Resend and version-controlled there. Passing a single
// app-wide override would force one logo onto all three — which is exactly the
// bug this removed.

const currentYear = () => String(new Date().getFullYear())

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; message: string }

/**
 * Low-level send by template alias. Returns a discriminated result rather than
 * throwing, so callers can decide how to surface a delivery failure (the auth
 * flows keep working even when a resend fails, and must not leak provider
 * internals to the client).
 */
async function sendTemplate(
  alias: string,
  to: string,
  variables: Record<string, string>,
  idempotencyKey?: string,
): Promise<SendEmailResult> {
  try {
    const { data, error } = await getResend().emails.send(
      {
        from: getFrom(),
        to,
        template: { id: alias, variables },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    )

    if (error) {
      console.error(`[email] Resend send failed (${alias}):`, error.message)
      return { ok: false, message: error.message }
    }
    return { ok: true, id: data?.id ?? '' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error'
    console.error(`[email] Resend threw (${alias}):`, message)
    return { ok: false, message }
  }
}

/**
 * Owner "set your password" email (was Supabase's signup confirmation).
 * `actionUrl` is the full, ready-to-click setup-password link built by the
 * caller from `admin.generateLink`.
 */
export function sendSetPasswordEmail(
  to: string,
  actionUrl: string,
): Promise<SendEmailResult> {
  return sendTemplate(EMAIL_TEMPLATES.setPassword, to, {
    action_url: actionUrl,
    year: currentYear(),
  })
}

/**
 * Member "confirm your email" activation email (was Supabase's magic link).
 * `actionUrl` is the full activation link built from `admin.generateLink`.
 */
export function sendConfirmEmail(
  to: string,
  actionUrl: string,
): Promise<SendEmailResult> {
  return sendTemplate(EMAIL_TEMPLATES.confirmEmail, to, {
    action_url: actionUrl,
    year: currentYear(),
  })
}

/**
 * Account-deletion verification code. `code` and `expiryLabel` are minted and
 * owned by the app (stored in Redis), so this replaces the fragile Supabase
 * reauthentication nonce entirely.
 */
export function sendDeleteAccountOtp(
  to: string,
  code: string,
  expiryLabel: string,
): Promise<SendEmailResult> {
  return sendTemplate(EMAIL_TEMPLATES.deleteAccountOtp, to, {
    otp_code: code,
    expiry_label: expiryLabel,
    year: currentYear(),
  })
}
