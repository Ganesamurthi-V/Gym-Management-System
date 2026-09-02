'use client'

import { useEffect, useRef, useState } from 'react'
import { isTourActive } from '@/lib/tours/tour-state'

/**
 * Connection states — kept for API compatibility with consumers that read it,
 * but polling is always "connected" while enabled.
 */
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
  /** Unique per mounted consumer; kept for API compatibility. */
  channelName: string
  subscriptions: ChannelSubscription[]
  enabled?: boolean
  /** Re-fetch authoritative state. This is the only callback that actually fires. */
  onResync?: () => void | Promise<void>
  /** Polling interval in ms. Default: 30 000 (30 s). */
  pollIntervalMs?: number
  /**
   * Skip the on-mount resync when the page was JUST server-rendered.
   *
   * The immediate resync exists to compensate for Next.js's client Router Cache,
   * which `next.config.mjs` lets serve a dynamic RSC payload for up to 180s — on
   * an in-app navigation the data really can be stale, so the resync is earned.
   *
   * On a fresh document load it is pure waste: the server rendered this exact
   * data microseconds ago, and for `useGymRealtime` the resync is
   * `router.refresh()`, so every hard load rendered the whole server tree twice.
   * Measured against this project, one owner render costs ~160-430ms of database
   * round trips, so the duplicate was doubling that for no new information.
   *
   * `performance.now()` is time since navigationStart, which is exactly the
   * signal needed: small means this mount belongs to the initial document load,
   * large means a later client-side navigation.
   */
  skipInitialResyncOnFreshLoad?: boolean
}

/**
 * How recent the document load has to be for a mount to count as "the server
 * just rendered this". Generous enough to cover slow hydration; anything beyond
 * it is treated as a client navigation, where the Router Cache may be stale.
 */
const FRESH_LOAD_WINDOW_MS = 3_000

/**
 * Drop-in replacement for the former Supabase Realtime hook.
 *
 * ─── WHAT CHANGED (Phase 4) ─────────────────────────────────────────────────
 * The previous implementation opened a WebSocket to `wss://*.supabase.co` from
 * the browser. That put the Supabase project hostname in the Network tab and
 * required CSP rules that weakened the overall security posture.
 *
 * This version replaces the socket with interval + visibilitychange polling.
 * On every tick (default 30 s) or when the tab returns to the foreground, we
 * call `onResync` — the same callback the old hook fired on subscribe, reconnect,
 * and foreground. Consumers already re-fetch authoritative state there, so
 * behaviour is preserved. The 30 s ceiling is a worst-case latency floor; most
 * owner actions occur while the user is looking at the page, so the foreground
 * resync fires first anyway.
 *
 * `subscriptions` and per-row callbacks are accepted for interface compatibility
 * but no longer invoked: they are unnecessary because onResync already fetches
 * the full dataset. If a future requirement needs sub-second push delivery
 * without a full-page poll, this hook can be upgraded to open a WebSocket to our
 * own /api/realtime/* SSE endpoint instead.
 */
export function useRealtimeChannel({
  channelName: _channelName,
  subscriptions: _subscriptions,
  enabled = true,
  onResync,
  pollIntervalMs = 30_000,
  skipInitialResyncOnFreshLoad = false,
}: UseRealtimeChannelOptions) {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(
    enabled ? 'connected' : 'disabled',
  )
  const onResyncRef = useRef(onResync)
  onResyncRef.current = onResync

  useEffect(() => {
    if (!enabled) {
      setConnectionState('disabled')
      return
    }

    setConnectionState('connected')
    let cancelled = false

    // Initial resync on mount — mirrors the SUBSCRIBED callback that the socket
    // hook used to fire.
    const doResync = () => {
      if (cancelled) return

      // Stand down while a guided tour is running. For owner pages `onResync` is
      // `router.refresh()`, which re-renders the Server Component subtree and
      // replaces the DOM node Driver.js has spotlighted, detaching the highlight
      // mid-tour. The launcher refreshes once the tour ends, so nothing is
      // permanently stale.
      if (isTourActive()) return

      void onResyncRef.current?.()
    }

    // Fire once immediately (equivalent to the socket's initial sync) — unless
    // the server just rendered this page, in which case there is nothing newer
    // to fetch. See `skipInitialResyncOnFreshLoad`.
    const isFreshServerRender =
      typeof performance !== 'undefined' && performance.now() < FRESH_LOAD_WINDOW_MS

    if (!(skipInitialResyncOnFreshLoad && isFreshServerRender)) {
      doResync()
    }

    // Interval replaces the WebSocket nudge for foreground-visible tabs.
    const interval = setInterval(doResync, pollIntervalMs)

    // Foreground resync — same as before.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') doResync()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, pollIntervalMs, skipInitialResyncOnFreshLoad])

  return {
    connectionState,
    isConnected: connectionState === 'connected',
  }
}
