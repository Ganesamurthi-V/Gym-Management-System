'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { memberKeys } from '@/lib/queries/member'

/**
 * Polls for member-scoped data changes — replaces direct Supabase Realtime.
 * Invalidates TanStack Query + router.refresh() on interval + foreground.
 */
export function useMemberRealtime() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      if (cancelled) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (cancelled) return
        queryClient.invalidateQueries({ queryKey: memberKeys.bundle })
        router.refresh()
      }, 1_500)
    }

    // Initial sync
    refresh()

    // 30s polling interval
    const interval = setInterval(refresh, 30_000)

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
