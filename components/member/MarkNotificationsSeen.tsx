'use client'

import { useEffect } from 'react'
import { writeSeen } from '@/lib/member/notificationSeen'

/** Renders nothing; opening the inbox marks everything up to the newest item as seen. */
export function MarkNotificationsSeen({ latestAt }: { latestAt: string | null }) {
  useEffect(() => { if (latestAt) writeSeen(latestAt) }, [latestAt])
  return null
}
