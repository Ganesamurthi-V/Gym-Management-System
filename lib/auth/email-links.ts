import 'server-only'

/**
 * lib/auth/email-links.ts
 * ───────────────────────
 * Builds the owner-facing auth links that used to be assembled by Supabase's
 * email templates. Now that Resend sends the email, the app builds the link
 * from the token GoTrue mints via `admin.auth.admin.generateLink()`.
 *
 * ─── Why a URL fragment (`#token_hash=…`) and not a query param ───────────────
 * The setup-password page reads `token_hash` / `type` from the URL FRAGMENT and
 * redeems them with `verifyOtp`. A fragment is never sent in an HTTP request, so
 * mail scanners and link previewers that auto-fetch links cannot consume the
 * one-time token — the defect that made Supabase's `{{ .ConfirmationURL }}`
 * links appear pre-expired. Keep the fragment shape exactly as the page expects:
 *   {origin}/auth/setup-password#token_hash=<hashed_token>&type=<email|signup|recovery>
 */

/** Trailing-slash-safe app origin. */
export function appOrigin(fallbackOrigin?: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin || '').replace(/\/+$/, '')
}

type LinkType = 'email' | 'signup' | 'recovery'

/**
 * Build the setup-password link from a GoTrue-minted `hashed_token`.
 *
 * `type` mirrors the `verifyOtp` type the page will use: `signup` for a new
 * owner confirmation, `recovery` for a password reset of a confirmed owner.
 */
export function setupPasswordLinkFromHashedToken(
  hashedToken: string,
  type: LinkType,
  origin?: string,
): string {
  const base = `${appOrigin(origin)}/auth/setup-password`
  return `${base}#token_hash=${encodeURIComponent(hashedToken)}&type=${type}`
}
