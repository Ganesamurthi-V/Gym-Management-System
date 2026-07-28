'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export type RealtimeConnectionState = 'disabled' | 'connecting' | 'connected' | 'error'
type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'
type RealtimeCallback = (payload: any) => void | Promise<void>

interface PostgresChangeFilter {
  event: PostgresChangeEvent
  schema?: string
  table: string
  filter?: string
}

interface BroadcastFilter {
  event: string
}

export type ChannelSubscription =
  | { type: 'postgres_changes'; filter: PostgresChangeFilter; callback: RealtimeCallback }
  | { type: 'broadcast'; filter: BroadcastFilter; callback: RealtimeCallback }

interface UseRealtimeChannelOptions {
  /** Unique per mounted consumer; never put credentials in a channel name. */
  channelName: string
  subscriptions: ChannelSubscription[]
  enabled?: boolean
  /** Securely re-fetch authoritative state after subscribe/reconnect/foreground. */
  onResync?: () => void | Promise<void>
}

/**
 * Lifecycle-safe Supabase channel for authenticated owner clients.
 *
 * postgres_changes remain subject to table RLS. Callbacks are kept in refs so
 * state changes do not create duplicate channels, while filter changes still
 * recreate the subscription. Re-syncing closes the fetch/subscribe race and
 * converges after a dropped socket or backgrounded tab.
 */
export function useRealtimeChannel({
  channelName,
  subscriptions,
  enabled = true,
  onResync,
}: UseRealtimeChannelOptions) {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(
    enabled ? 'connecting' : 'disabled',
  )
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscriptionsRef = useRef(subscriptions)
  const onResyncRef = useRef(onResync)

  subscriptionsRef.current = subscriptions
  onResyncRef.current = onResync

  const subscriptionKey = JSON.stringify(
    subscriptions.map((subscription) => ({
      type: subscription.type,
      filter: subscription.filter,
    })),
  )

  useEffect(() => {
    if (!enabled || subscriptionsRef.current.length === 0) {
      setConnectionState('disabled')
      return
    }

    const supabase = createClient()
    let cancelled = false
    let channel = supabase.channel(channelName)

    subscriptionsRef.current.forEach((subscription, index) => {
      const invokeLatest = (payload: any) => {
        const callback = subscriptionsRef.current[index]?.callback
        if (callback) void callback(payload)
      }

      if (subscription.type === 'postgres_changes') {
        channel = channel.on(
          'postgres_changes',
          {
            event: subscription.filter.event,
            schema: subscription.filter.schema ?? 'public',
            table: subscription.filter.table,
            ...(subscription.filter.filter ? { filter: subscription.filter.filter } : {}),
          },
          invokeLatest,
        )
      } else {
        channel = channel.on('broadcast', { event: subscription.filter.event }, invokeLatest)
      }
    })

    setConnectionState('connecting')
    channel.subscribe((status: string) => {
      if (cancelled) return
      if (status === 'SUBSCRIBED') {
        setConnectionState('connected')
        void onResyncRef.current?.()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnectionState('error')
      } else if (status === 'CLOSED') {
        setConnectionState('connecting')
      }
    })
    channelRef.current = channel

    const handleForeground = () => {
      if (document.visibilityState === 'visible') void onResyncRef.current?.()
    }
    document.addEventListener('visibilitychange', handleForeground)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleForeground)
      if (channelRef.current === channel) channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [channelName, enabled, subscriptionKey])

  return {
    connectionState,
    isConnected: connectionState === 'connected',
  }
}
