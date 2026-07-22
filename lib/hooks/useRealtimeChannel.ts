'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface PostgresChangeFilter {
  event: PostgresChangeEvent
  schema?: string
  table: string
  filter?: string
}

interface BroadcastFilter {
  event: string
}

type ChannelSubscription =
  | { type: 'postgres_changes'; filter: PostgresChangeFilter; callback: (payload: any) => void }
  | { type: 'broadcast'; filter: BroadcastFilter; callback: (payload: any) => void }

interface UseRealtimeChannelOptions {
  /** Unique channel name */
  channelName: string
  /** List of subscriptions (postgres_changes or broadcast) */
  subscriptions: ChannelSubscription[]
  /** Whether the channel should be active (default: true) */
  enabled?: boolean
}

/**
 * useRealtimeChannel — reusable hook for Supabase Realtime subscriptions.
 *
 * Manages channel lifecycle (subscribe/unsubscribe) and exposes connection state.
 * Supports both `postgres_changes` and `broadcast` event types.
 *
 * Security: Uses the browser client (anon key + RLS). No service role key
 * is ever exposed to the client. postgres_changes respect RLS policies on
 * the subscribed tables.
 */
export function useRealtimeChannel({
  channelName,
  subscriptions,
  enabled = true,
}: UseRealtimeChannelOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!enabled || subscriptions.length === 0) return

    const supabase = createClient()

    let channel = supabase.channel(channelName)

    for (const sub of subscriptions) {
      if (sub.type === 'postgres_changes') {
        channel = channel.on(
          'postgres_changes',
          {
            event: sub.filter.event,
            schema: sub.filter.schema ?? 'public',
            table: sub.filter.table,
            ...(sub.filter.filter ? { filter: sub.filter.filter } : {}),
          },
          sub.callback
        )
      } else if (sub.type === 'broadcast') {
        channel = channel.on(
          'broadcast',
          { event: sub.filter.event },
          sub.callback
        )
      }
    }

    channel.subscribe((status: string) => {
      setIsConnected(status === 'SUBSCRIBED')
    })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      setIsConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled])

  return { isConnected }
}
