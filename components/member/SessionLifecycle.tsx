'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { fetchSession } from '@/lib/auth/client-auth'

/**
 * Keeps a long-lived member tab in step with the real session state.
 *
 * ── HOW THIS WORKED BEFORE, AND WHY IT CHANGED ──────────────────────────────
 * This used the Supabase browser SDK: `onAuthStateChange` to catch SIGNED_OUT,
 * plus `getSession()` + `refreshSession()` on foreground. That opened a direct
 * connection to `*.supabase.co` from the browser on every member page.
 *
 * Both jobs are now done by one same-origin call to `/api/auth/session`:
 *
 *   - Session refresh: the endpoint calls `getUser()` server-side, which renews
 *     an expired access token and writes the refreshed HttpOnly cookies onto the
 *     response. That is exactly what `refreshSession()` was for.
 *
 *   - Sign-out detection: if the endpoint reports `authenticated: false`, the
 *     session is gone (expired, revoked, or signed out in another tab) and we
 *     redirect. This replaces the SIGNED_OUT event, and additionally catches
 *     server-side revocation, which the SDK event could not see.
 *
 * Checked when the tab becomes visible, which is when a stale session actually
 * matters — the user is about to interact again.
 */
export function SessionLifecycle() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    // Never bounce the user off the auth pages themselves; being signed out is
    // the expected state there.
    if (pathname.startsWith('/auth/')) return

    let cancelled = false

    const syncSession = async () => {
      if (document.visibilityState !== 'visible') return

      const session = await fetchSession()
      if (cancelled) return

      if (!session.authenticated) {
        router.replace('/auth/login')
        router.refresh()
      }
    }

    document.addEventListener('visibilitychange', syncSession)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', syncSession)
    }
  }, [pathname, router])

  return null
}
