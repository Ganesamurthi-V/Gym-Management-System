'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Keeps a member tab in step with the real session state using polling.
 * Replaces the direct Supabase browser client onAuthStateChange + refreshSession.
 */
export function SessionLifecycle() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (pathname.startsWith('/auth/')) return

    let cancelled = false

    const syncSession = async () => {
      if (document.visibilityState !== 'visible') return

      try {
        const res = await fetch('/api/auth/session', {
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          cache: 'no-store',
        })
        if (cancelled) return

        if (res.status === 401) {
          router.replace('/auth/login')
          router.refresh()
        }
      } catch { /* network error — retry on next visibility change */ }
    }

    document.addEventListener('visibilitychange', syncSession)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', syncSession)
    }
  }, [pathname, router])

  return null
}
