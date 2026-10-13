'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import type { GymEvent } from '@/lib/gamification/events'

export type OwnerEvent = GymEvent & { completionCount: number; pendingRewardCount: number }

/**
 * The owner's events, fetched from our own API on mount.
 *
 * Client-side rather than server-rendered with the rest of the page: events are
 * a secondary card below the leaderboard, and fetching here keeps them off the
 * page's critical path (the Member App page is already the heaviest owner
 * route). `reload` is called after every create / edit / give / delete so the
 * counts ("2 rewards to hand over") never go stale behind the Router Cache.
 */
export function useGymEvents() {
  const [events, setEvents] = useState<OwnerEvent[] | null>(null)
  const [error, setError] = useState(false)
  const alive = useRef(true)

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ data: { events: OwnerEvent[] } }>('/api/gamification/events')
      if (!alive.current) return
      setEvents(res.data.events)
      setError(false)
    } catch {
      if (alive.current) setError(true)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void reload()
    return () => {
      alive.current = false
    }
  }, [reload])

  return { events, error, reload }
}
