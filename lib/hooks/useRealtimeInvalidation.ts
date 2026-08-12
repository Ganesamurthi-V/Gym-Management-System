'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeConnectionState } from './useRealtimeChannel'

interface UseRealtimeInvalidationOptions {
  channelName: string
  onInvalidate: () => void | Promise<void>
  enabled?: boolean
  debounceMs?: number
  /** Kept for interface compatibility; no longer changes behaviour. */
  privateChannel?: boolean
  /** Polling interval in ms. Default: 30 000 (30 s). */
  pollIntervalMs?: number
}

/**
 * Drop-in polling replacement for the former Supabase Realtime broadcast hook.
 *
 * The previous version subscribed to a Supabase Realtime broadcast channel and
 * called `onInvalidate` when an `invalidate` event arrived. The new version
 * calls it on an interval + visibilitychange, which is equivalent because the
 * callback always re-fetches authoritative state anyway — the broadcast was
 * just a "poke" to trigger the fetch.
 *
 * The debounce is kept for back-pressure when many successive invalidations
 * would fire in quick succession (e.g. multiple channel events within a tick).
 */
export function useRealtimeInvalidation({
  channelName: _channelName,
  onInvalidate,
  enabled = true,
  debounceMs = 1_500,
  privateChannel: _privateChannel = false,
  pollIntervalMs = 30_000,
}: UseRealtimeInvalidationOptions) {
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

    // Initial fire — mirrors the SUBSCRIBED callback that triggered the first fetch.
    schedule()

    // Polling interval replaces WebSocket nudge.
    const interval = setInterval(schedule, pollIntervalMs)

    // Foreground resync — same as before.
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
  }, [enabled, debounceMs, pollIntervalMs])

  return {
    connectionState,
    isConnected: connectionState === 'connected',
  }
}
