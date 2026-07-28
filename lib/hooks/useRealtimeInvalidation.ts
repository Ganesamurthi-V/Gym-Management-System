'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeConnectionState } from './useRealtimeChannel'

interface UseRealtimeInvalidationOptions {
  channelName: string
  onInvalidate: () => void | Promise<void>
  enabled?: boolean
  debounceMs?: number
  /** Requires a Supabase Auth session and a matching realtime.messages SELECT policy. */
  privateChannel?: boolean
}

/**
 * Consumes payload-free broadcast hints and always re-fetches authoritative data.
 * Public hints are untrusted admin refresh signals; private hints are authorized
 * by realtime.messages RLS for authenticated owner topics.
 */
export function useRealtimeInvalidation({
  channelName,
  onInvalidate,
  enabled = true,
  debounceMs = 1_500,
  privateChannel = false,
}: UseRealtimeInvalidationOptions) {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(
    enabled ? 'connecting' : 'disabled',
  )
  const callbackRef = useRef(onInvalidate)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  callbackRef.current = onInvalidate

  useEffect(() => {
    if (!enabled) {
      setConnectionState('disabled')
      return
    }

    const supabase = createClient()
    let cancelled = false
    let channel: RealtimeChannel | null = null

    const invoke = async () => {
      timerRef.current = null
      if (cancelled) return

      try {
        await callbackRef.current()
        retryCountRef.current = 0
      } catch {
        if (cancelled || retryCountRef.current >= 4) return
        const retryDelay = Math.min(30_000, 1_000 * (2 ** retryCountRef.current))
        retryCountRef.current += 1
        timerRef.current = setTimeout(() => { void invoke() }, retryDelay)
      }
    }

    const schedule = () => {
      if (cancelled || timerRef.current) return
      retryCountRef.current = 0
      timerRef.current = setTimeout(() => { void invoke() }, debounceMs)
    }

    const connect = async () => {
      if (privateChannel) await supabase.realtime.setAuth()
      if (cancelled) return

      channel = supabase
        .channel(channelName, { config: { private: privateChannel } })
        .on('broadcast', { event: 'invalidate' }, schedule)
        .subscribe((status: string) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            setConnectionState('connected')
            schedule()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setConnectionState('error')
          } else if (status === 'CLOSED') {
            setConnectionState('connecting')
          }
        })
    }

    setConnectionState('connecting')
    void connect().catch(() => {
      if (!cancelled) setConnectionState('error')
    })

    const handleForeground = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', handleForeground)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleForeground)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      if (channel) void supabase.removeChannel(channel)
    }
  }, [channelName, debounceMs, enabled, privateChannel])

  return {
    connectionState,
    isConnected: connectionState === 'connected',
  }
}
