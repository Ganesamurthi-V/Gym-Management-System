'use client'

import { useEffect, useRef, useState } from 'react'

export type RealtimeConnectionState = 'disabled' | 'connecting' | 'connected' | 'error'

interface Options {
  channelName: string
  onInvalidate: () => void | Promise<void>
  enabled?: boolean
  debounceMs?: number
}

/**
 * Admin panel invalidation — polls on an interval + visibilitychange instead of
 * opening a direct Supabase Realtime WebSocket.
 *
 * The admin panel is an internal tool, so a 10-second poll is acceptable.
 * This removes the dependency on NEXT_PUBLIC_SUPABASE_URL/ANON_KEY in the
 * admin client bundle.
 */
export function useRealtimeInvalidation({
  channelName: _channelName,
  onInvalidate,
  enabled = true,
  debounceMs = 1_500,
}: Options) {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(
    enabled ? 'connected' : 'disabled',
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

    setConnectionState('connected')
    let cancelled = false

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

    // Initial fire
    schedule()

    // 10s polling for admin panel (internal tool — acceptable latency)
    const interval = setInterval(schedule, 10_000)

    const handleForeground = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', handleForeground)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleForeground)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [enabled, debounceMs])

  return {
    connectionState,
    isConnected: connectionState === 'connected',
  }
}
