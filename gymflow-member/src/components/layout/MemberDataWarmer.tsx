'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { prefetchMemberBundle } from '@/lib/queries/member'

/** Routes reachable from the bottom nav and the home quick-actions. */
const WARM_ROUTES = [
  '/home',
  '/workout',
  '/progress',
  '/rewards',
  '/profile',
  '/membership',
  '/attendance',
] as const

/**
 * Warms both caches once the current page has painted:
 *
 * 1. The Next.js Router Cache — `router.prefetch()` pulls each tab's RSC
 *    payload into memory so a tap renders instantly with no server round trip.
 * 2. The TanStack Query cache — so client components can read member data
 *    without waiting on a request.
 *
 * Runs after a short idle delay so it never competes with the render of the
 * page the user is actually looking at. Renders nothing.
 */
export function MemberDataWarmer() {
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false

    const warm = () => {
      if (cancelled) return
      for (const route of WARM_ROUTES) router.prefetch(route)
      void prefetchMemberBundle(queryClient)
    }

    // Prefer real idle time; fall back to a timeout on Safari/older browsers.
    const supportsIdle = 'requestIdleCallback' in window
    const handle = supportsIdle
      ? window.requestIdleCallback(warm, { timeout: 2000 })
      : window.setTimeout(warm, 600)

    return () => {
      cancelled = true
      if (supportsIdle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [router, queryClient])

  return null
}
