'use client'

import { useEffect } from 'react'
import { resyncPush } from '@/lib/push/client'
import { bumpVisit } from '@/lib/push/reminder'

/** Counts one app visit per browser session and refreshes an already-granted subscription. Renders nothing. */
export function PushSync() {
  useEffect(() => {
    try {
      if (!sessionStorage.getItem('gf-push-session')) {
        sessionStorage.setItem('gf-push-session', '1')
        bumpVisit()
      }
    } catch { /* storage blocked */ }
    void resyncPush()
  }, [])
  return null
}
