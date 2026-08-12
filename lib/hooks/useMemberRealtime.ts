'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { memberKeys } from '@/lib/member/queries'

/**
 * Polls for member-scoped data changes and triggers both a TanStack Query
 * invalidation and a Server Component refresh.
 *
 * ─── WHAT CHANGED (Phase 4) ─────────────────────────────────────────────────
 * Previously subscribed to Supabase Realtime `postgres_changes` on 5 tables and
 * called `queryClient.invalidateQueries()` + `router.refresh()` on every event.
 * Now it polls on an interval + foreground, producing the same effect without
 * opening a WebSocket to `wss://*.supabase.co`.
 *
 * The debounce is kept: if multiple invalidations queue up within 1.5 s (e.g.
 * batch attendance marks), only one refresh fires.
 *
 * Security: data access is still gated by RLS through the server components and
 * API routes that the refresh hits. No per-table subscription filtering needed.
 *
 * Usage (unchanged): mount once in the member shell (MemberDataWarmer).
 */
export function useMemberRealtime() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      if (cancelled) return
      // Debounce: rapid successive triggers produce a single refresh.
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (cancelled) return
        queryClient.invalidateQueries({ queryKey: memberKeys.bundle })
        router.refresh()
      }, 1_500)
    }

    // Initial sync on mount.
    refresh()

    // Polling interval (30 s) replaces the Realtime WebSocket nudge.
    const interval = setInterval(refresh, 30_000)

    // Foreground resync — same as before.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [router, queryClient])
}
