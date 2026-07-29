'use client'

/**
 * features/member-app/hooks/useMemberAppActions.ts
 *
 * Wraps the service-layer mutations with inflight tracking and toast feedback
 * so every action button can show a spinner and stay disabled while pending.
 */

import { useCallback, useState } from 'react'
import { toast } from 'react-hot-toast'
import type { ActionResult } from '@/types/member-app'

export function useAsyncAction() {
  /** Key of the action currently running, or null when idle. */
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const run = useCallback(
    async (key: string, fn: () => Promise<ActionResult>): Promise<ActionResult | null> => {
      // Guard against double submission while a mutation is inflight.
      if (pendingKey !== null) return null

      setPendingKey(key)
      try {
        const result = await fn()
        if (result.success) toast.success(result.message)
        else toast.error(result.message)
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        toast.error(message)
        return { success: false, message }
      } finally {
        setPendingKey(null)
      }
    },
    [pendingKey],
  )

  return {
    run,
    pendingKey,
    isPending: (key: string) => pendingKey === key,
    isBusy: pendingKey !== null,
  }
}

/** Placeholder for configuration surfaces that are not built yet. */
export function useComingSoon() {
  return useCallback((feature: string) => {
    toast(`${feature} configuration is coming soon`, { icon: '🚧' })
  }, [])
}
