'use client'

import { useEffect, useRef, useState } from 'react'
import { getRealtimeClient } from '@/lib/supabase-browser'

export type RealtimeConnectionState = 'disabled' | 'connecting' | 'connected' | 'error'

interface Options {
  channelName: string
  onInvalidate: () => void | Promise<void>
  enabled?: boolean
  debounceMs?: number
}

/**
 * Admin clients have custom app sessions, not Supabase Auth sessions. They
 * therefore consume only payload-free broadcast hints and re-fetch data from
 * cookie-authenticated admin APIs. Never apply broadcast payloads as data.
 */
export function useRealtimeInvalidation({
  channelName,
  onInvalidate,
  enabled = true,
  debounceMs = 1_500,
}: Options) {
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

    let cancelled = false
    let supabase: ReturnType<typeof getRealtimeClient>

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

    try {
      supabase = getRealtimeClient()
    } catch {
      setConnectionState('error')
      return
    }

    const channel = supabase
      .channel(channelName)
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

    const handleForeground = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', handleForeground)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleForeground)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [channelName, debounceMs, enabled])

  return {
    connectionState,
    isConnected: connectionState === 'connected',
  }
}
