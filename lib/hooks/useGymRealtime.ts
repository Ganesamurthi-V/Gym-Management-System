'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeChannel, type ChannelSubscription } from './useRealtimeChannel'

/**
 * Subscribes to Supabase Realtime postgres_changes on the specified tables,
 * filtered to the owner's gym, and calls `router.refresh()` when an event
 * arrives. This re-runs the Server Component tree — fetching fresh data from
 * Postgres — without a full page reload, keeping all client state intact.
 *
 * Previously every page showed stale server-rendered data until the owner
 * manually refreshed the browser. Now changes made by the owner (in another
 * tab or device), by cron jobs (subscription expiry), by admin actions, or by
 * members (attendance, activations) are reflected within ~1-2 seconds.
 *
 * The subscription uses the `gym_id=eq.{gymId}` filter, which combined with
 * the table's RLS policy means only events for THIS owner's gym are delivered.
 *
 * Usage:
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
