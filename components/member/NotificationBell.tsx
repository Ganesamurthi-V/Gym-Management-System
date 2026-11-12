'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { hasUnread, readSeen } from '@/lib/member/notificationSeen'

/** Bell link to the inbox. The dot is decided after mount from localStorage, so SSR and first paint match. */
export function NotificationBell({ latestAt }: { latestAt: string | null }) {
  const [unread, setUnread] = useState(false)
  useEffect(() => { setUnread(hasUnread(latestAt, readSeen())) }, [latestAt])

  return (
    <Link
      href="/m/notifications"
      aria-label={unread ? 'Notifications, new' : 'Notifications'}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-slate-700 transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <Bell aria-hidden="true" className="h-5 w-5" />
      {unread && <span aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-surface bg-red-500" />}
    </Link>
  )
}
