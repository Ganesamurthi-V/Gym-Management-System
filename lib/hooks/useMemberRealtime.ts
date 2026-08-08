'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { memberKeys } from '@/lib/member/queries'

/**
 * Subscribes the member PWA to Supabase Realtime so data changes (new
 * memberships, attendance marks, workout assignments, subscription renewals)
 * appear without a manual browser refresh.
 *
 * Listens for postgres_changes on the member's own data (scoped by RLS):
 *   - memberships (renewal, expiry)
 *   - attendance (gym marks a check-in)
 *   - program_assignments (new workout assigned)
 *   - members (profile edits by the owner, portal status changes)
 *
 * On any event:
 *   1. Invalidates the TanStack Query member bundle cache → client components
 *      that use `useMemberBundle()` re-fetch automatically.
 *   2. Calls `router.refresh()` → Server Components re-render with fresh
 *      Postgres data, streamed to the browser without a full page reload.
 *
 * Security: RLS is the delivery filter. The member's JWT can only receive rows
 * matching their own `auth_user_id` / `member_id`, so no gym-level filter is
 * needed in the subscription itself.
 *
 * Usage: mount once in the member shell layout (MemberDataWarmer or similar).
 */
export function useMemberRealtime() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const refresh = () => {
      if (cancelled) return
      // Debounce: multiple changes in quick succession (e.g. batch attendance)
      // produce a single refresh instead of a storm.
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (cancelled) return
        // 1. Invalidate TanStack Query cache → client hooks refetch.
        queryClient.invalidateQueries({ queryKey: memberKeys.bundle })
        // 2. Refresh server components → streamed RSC update.
        router.refresh()
      }, 1500)
    }

    const tables = ['memberships', 'attendance', 'program_assignments', 'members']

    let channel = supabase.channel('member-realtime')

    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        refresh,
      )
    }

    // `status` is annotated explicitly because the shared browser client is
    // intentionally untyped (no `Database` generic), so there is no contextual
    // type for the callback parameter to infer from.
    channel.subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
      if (cancelled) return
      if (status === 'SUBSCRIBED') {
        // Initial sync on connect — handles the case where events fired
        // while the socket was being established.
        refresh()
      }
    })

    channelRef.current = channel

    // Also refresh when the tab comes back to foreground (covers dropped sockets).
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [router, queryClient])
}
