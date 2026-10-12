'use client'

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_LEADERBOARD_LIMIT } from '@/lib/gamification/constants'
import type { LeaderboardApiData } from '@/lib/gamification/leaderboardDisplay'
import type { LeaderboardBoard, LeaderboardRow } from '@/lib/gamification/types'

/**
 * Live leaderboard rows for one board, shared by the member board
 * (`/m/leaderboard`) and the owner preview (`/owner/member-app`).
 *
 * Same idea as the other hooks in this folder: polling-based resync, not a
 * Supabase Realtime socket (the browser never talks to Supabase). It differs in
 * one way: those hooks call `router.refresh()` and re-render the whole server
 * tree, while this one fetches a small JSON route, because a board that updates
 * every 20 s must not re-run every query on the page each time.
 *
 * Behaviour:
 *  - fetches on mount, whenever `board` changes, every `intervalMs` while the
 *    document is visible, and immediately when the tab regains focus;
 *  - a hidden tab does not poll at all (a phone in a pocket costs nothing);
 *  - a newer request aborts the older one, so a slow response for the previous
 *    board can never overwrite the current one;
 *  - rows are kept per board, so a refetch never blanks the list and returning
 *    to a board already seen shows its last rows at once while it refreshes.
 *    `loading` is true only while a board has nothing to show yet.
 *
 * `initialRows` seeds the board the hook is FIRST rendered with (server-fetched
 * rows, so the first paint is not a spinner). It is read once; later values are
 * ignored because by then the hook's own polled rows are newer.
 */

export interface UseLeaderboardOptions {
  /** Server-rendered rows for the initial `board`. */
  initialRows?: LeaderboardRow[]
  /** 1..200, default 50. */
  limit?: number
  /** Poll interval, default 20 000 ms. */
  intervalMs?: number
  /** false pauses fetching and polling (rows already loaded are kept). */
  enabled?: boolean
}

export interface UseLeaderboardResult {
  rows: LeaderboardRow[]
  loading: boolean
  error: string | null
  refresh: () => void
}

const DEFAULT_INTERVAL_MS = 20_000

/**
 * Returning to a tab fires both `visibilitychange` and `focus`. Without a floor
 * that is two requests, the second aborting the first, on every app switch.
 */
const MIN_REFETCH_GAP_MS = 2_000

type RowsByBoard = Partial<Record<LeaderboardBoard, LeaderboardRow[]>>

async function fetchLeaderboard(
  board: LeaderboardBoard,
  limit: number,
  signal: AbortSignal,
): Promise<LeaderboardRow[]> {
  // Plain fetch rather than `api.get` from lib/api/client.ts only because that
  // client has no AbortSignal parameter. Same guarantees are set by hand: our
  // own origin, session cookie, the X-Requested-With marker, never HTTP-cached.
  const res = await fetch(`/api/gamification/leaderboard?board=${board}&limit=${limit}`, {
    signal,
    cache: 'no-store',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })

  let body: { success?: boolean; data?: Partial<LeaderboardApiData>; error?: { message?: string } } = {}
  try {
    body = await res.json()
  } catch {
    // Non-JSON body (proxy error page); handled as a failure below.
  }

  if (!res.ok || body.success !== true) {
    if (res.status === 401) throw new Error('Please sign in again.')
    if (res.status === 429) throw new Error('Too many refreshes. Trying again shortly.')
    throw new Error(body.error?.message ?? 'Could not load the leaderboard.')
  }
  return Array.isArray(body.data?.rows) ? body.data.rows : []
}

export function useLeaderboard(
  board: LeaderboardBoard,
  opts?: UseLeaderboardOptions,
): UseLeaderboardResult {
  const limit = opts?.limit ?? DEFAULT_LEADERBOARD_LIMIT
  const intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS
  const enabled = opts?.enabled ?? true

  const [rowsByBoard, setRowsByBoard] = useState<RowsByBoard>(() =>
    opts?.initialRows ? { [board]: opts.initialRows } : {},
  )
  // Tagged with its board so an error from the previous tab is not shown on this one.
  const [failure, setFailure] = useState<{ board: LeaderboardBoard; message: string } | null>(null)
  // Bumped by refresh(); being an effect dependency, it restarts the poll loop
  // with an immediate fetch.
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let controller: AbortController | null = null
    let lastStartedAt = 0

    const load = async () => {
      if (cancelled) return
      controller?.abort()
      const current = new AbortController()
      controller = current
      lastStartedAt = Date.now()

      try {
        const rows = await fetchLeaderboard(board, limit, current.signal)
        if (cancelled || current.signal.aborted) return
        setRowsByBoard(prev => ({ ...prev, [board]: rows }))
        setFailure(null)
      } catch (err) {
        // Aborted on purpose (newer request, board change, unmount): not an error.
        if (cancelled || current.signal.aborted) return
        // Rows are left as they were: a failed poll must not empty a board the
        // user is reading. The next tick retries.
        setFailure({
          board,
          message: err instanceof Error && err.message ? err.message : 'Could not load the leaderboard.',
        })
      }
    }

    const loadIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastStartedAt < MIN_REFETCH_GAP_MS) return
      void load()
    }

    // Mount, board change and refresh() all land here. Fetch even when seeded
    // with server rows: after an in-app navigation the Router Cache may have
    // served a payload up to 180 s old.
    void load()

    const interval = setInterval(loadIfVisible, intervalMs)
    document.addEventListener('visibilitychange', loadIfVisible)
    window.addEventListener('focus', loadIfVisible)

    return () => {
      cancelled = true
      controller?.abort()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', loadIfVisible)
      window.removeEventListener('focus', loadIfVisible)
    }
  }, [board, limit, intervalMs, enabled, refreshToken])

  const refresh = useCallback(() => setRefreshToken(n => n + 1), [])

  const rows = rowsByBoard[board]
  const error = failure?.board === board ? failure.message : null

  return {
    rows: rows ?? EMPTY_ROWS,
    loading: enabled && rows === undefined && error === null,
    error,
    refresh,
  }
}

/** Stable reference, so consumers' memo/effect dependencies do not churn while loading. */
const EMPTY_ROWS: LeaderboardRow[] = []
