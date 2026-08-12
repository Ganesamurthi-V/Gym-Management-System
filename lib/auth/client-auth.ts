'use client'

/**
 * lib/auth/client-auth.ts
 *
 * Browser-side auth helpers that talk to our own /api/auth/* endpoints instead
 * of to Supabase directly.
 *
 * Before this module, client components imported the Supabase browser SDK and
 * called `supabase.auth.*`, which meant every signed-in page opened requests to
 * `https://<project>.supabase.co` — putting the project hostname and the anon
 * key in the Network tab and in the JS bundle. These helpers keep all of that
 * on the server; the browser only ever sees same-origin `/api/auth/*` calls.
 *
 * Deliberately plain `fetch` rather than the `api` client in lib/api/client.ts:
 * these run in sign-out and guard paths where a thrown error would strand the
 * user mid-navigation. Every helper here resolves instead of throwing.
 */

import type { AppRole } from '@/lib/auth/roles'

export type SessionInfo = {
  authenticated: boolean
  userId: string | null
  email: string | null
  role: AppRole | null
  emailConfirmedAt: string | null
  name: string | null
}

const ANONYMOUS: SessionInfo = {
  authenticated: false,
  userId: null,
  email: null,
  role: null,
  emailConfirmedAt: null,
  name: null,
}

/** Headers that mark a request as same-origin XHR (see withAuth CSRF check). */
const XHR_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
} as const

/**
 * Reads the current session from the HttpOnly cookie, server-side.
 *
 * Replaces `supabase.auth.getUser()` / `getSession()` / `getClaims()`.
 *
 * Side effect worth knowing about: the endpoint calls `getUser()` on the server,
 * which renews an expired access token and writes the refreshed cookies back on
 * the response. So calling this also serves as a session refresh — that is how
 * `SessionLifecycle` keeps long-lived tabs alive without `refreshSession()`.
 *
 * Never throws. A network failure resolves to the anonymous session, so callers
 * that guard routes fail closed.
 */
export async function fetchSession(): Promise<SessionInfo> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      cache: 'no-store',
    })
    if (!res.ok) return ANONYMOUS
    return await res.json() as SessionInfo
  } catch {
    return ANONYMOUS
  }
}

/**
 * Signs the user out server-side, clearing the auth cookies.
 *
 * Replaces `supabase.auth.signOut()`.
 *
 * @param scope 'global' (default) kills every session for the user; 'local'
 *              only this device — used where the old code passed
 *              `{ scope: 'local' }`, and by guards clearing a stale session.
 * @returns `true` if the server confirmed the sign-out.
 *
 * Never throws: callers redirect to the login page regardless, and an exception
 * here would leave the user stuck on a page they are trying to leave.
 */
export async function signOutViaApi(
  scope: 'global' | 'local' | 'others' = 'global',
): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/signout', {
      method: 'POST',
      credentials: 'include',
      headers: XHR_HEADERS,
      body: JSON.stringify({ scope }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Sets the password for the signed-in user.
 *
 * Replaces `supabase.auth.updateUser({ password })`.
 *
 * Unlike the helpers above this reports failure, because the caller renders the
 * message in a form: resolves `{ ok: true }` or `{ ok: false, error, code }`.
 */
export async function updatePasswordViaApi(
  password: string,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  try {
    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      credentials: 'include',
      headers: XHR_HEADERS,
      body: JSON.stringify({ password }),
    })

    if (res.ok) return { ok: true }

    let message = 'Could not update your password. Please try again.'
    let code: string | undefined
    try {
      const json = await res.json() as { error?: string; code?: string }
      if (json?.error) message = json.error
      code = json?.code
    } catch { /* non-JSON error body — keep the default message */ }

    return { ok: false, error: message, code }
  } catch {
    return { ok: false, error: 'Network error. Please check your connection and try again.' }
  }
}
