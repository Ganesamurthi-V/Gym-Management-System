'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeChannel, type ChannelSubscription } from './useRealtimeChannel'

/**
 * Polls for gym-scoped data changes and triggers a Server Component refresh.
 *
 * ─── WHAT CHANGED (Phase 4) ─────────────────────────────────────────────────
 * Previously subscribed to Supabase Realtime `postgres_changes` and called
 * `router.refresh()` on every row event. Now it polls via `useRealtimeChannel`,
 * which calls `onResync` (= `router.refresh()`) on an interval + foreground.
 *
 * The `tables` and `gymId` args are kept for call-site compatibility; they are
 * semantically inert because the refresh loads whatever the Server Component
 * fetches, which is already scoped to the user's gym by RLS + withAuth.
 *
 * Usage (unchanged at call sites):
 *   useGymRealtime(gymId, ['members', 'memberships', 'attendance'])
 */
export function useGymRealtime(
  gymId: string | null | undefined,
  tables: string[],
  options?: { enabled?: boolean; debounceMs?: number },
) {
  const router = useRouter()
  const enabled = (options?.enabled ?? true) && Boolean(gymId) && tables.length > 0

  const handleChange = useCallback(() => {
    router.refresh()
  }, [router])

  // Subscriptions kept for interface compatibility; useRealtimeChannel only
  // calls onResync now.
  const subscriptions: ChannelSubscription[] = tables.flatMap((table) => [
    {
      type: 'postgres_changes' as const,
      filter: { event: '*' as const, schema: 'public', table, filter: `gym_id=eq.${gymId}` },
      callback: handleChange,
    },
  ])

  return useRealtimeChannel({
    channelName: `gym-${gymId}-${tables.sort().join('-')}`,
    subscriptions,
    enabled,
    onResync: handleChange,
  })
}
