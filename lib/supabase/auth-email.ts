import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSupabaseUrl, getSupabaseAnonKey } from './env'

/**
 * lib/supabase/auth-email.ts
 * ─────────────────────────
 * A server-only Supabase client used ONLY to trigger transactional auth emails
 * (signup confirmation, confirmation resend, password recovery).
 *
 * WHY THIS EXISTS — THE PKCE TOKEN TRAP
 * ------------------------------------
 * `@supabase/ssr`'s `createServerClient` hard-codes `flowType: "pkce"`, and it
 * does so AFTER spreading caller options, so it cannot be overridden:
 *
 *     auth: { ...options?.auth, flowType: "pkce", ... }
 *
 * `auth-js` then branches on that flag when it asks GoTrue to send an email:
 *
 *     if (this.flowType === 'pkce') {
 *       [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(...)
 *     }
 *
 * Both `signUp()` and `resetPasswordForEmail()` take that branch. When GoTrue
 * receives a code challenge it binds the emailed token to a PKCE flow and
 * prefixes it with `pkce_`, so `{{ .TokenHash }}` in the email template becomes
 * a PKCE token rather than a plain one-time OTP hash.
 *
 * That token cannot be redeemed by `verifyOtp()`. `verifyOtp` POSTs to `/verify`
 * and transforms the reply with `_sessionResponse` — it performs no code
 * exchange and never reads the stored verifier. So a PKCE-bound token fails
 * verification every single time, for every brand-new owner, and again on every
 * retry. That was the cause of the "this verification link has expired or was
 * already used" screen appearing even for a genuinely new signup.
 *
 * Setting `flowType: 'implicit'` here means no code challenge is sent, so GoTrue
 * issues a plain token hash. `verifyOtp()` can then redeem it from any browser
 * or device — which is the entire point of the token-hash strategy.
 *
 * WHAT THIS CLIENT MUST NOT DO
 * ---------------------------
 * It must never persist a session. It exists purely to ask GoTrue to send mail;
 * the session is created later, by `/api/auth/verify-email`, using the
 * cookie-bound SSR client so the session lands in HttpOnly cookies. Writing
 * session state from here would put auth state outside those cookies.
 *
 * Uses the anon key, not the service role key, because these are ordinary
 * public auth endpoints and this module is imported by route handlers only.
 */
export function createAuthEmailClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      // The reason this module exists — see above.
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
