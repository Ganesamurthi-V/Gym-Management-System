'use client'

import { useEffect, useState } from 'react'
import { Info, AlertTriangle, AlertCircle, X } from 'lucide-react'
import {
  safeAnnouncementLink,
  shouldShowAnnouncement,
  type Announcement,
} from '@/lib/announcement-shared'

const DISMISS_KEY = 'gf_announcement_dismissed'

const STYLES = {
  info: {
    wrap: 'bg-brand-50 border-brand-200 text-brand-800',
    link: 'text-brand-700 hover:text-brand-900',
    Icon: Info,
    iconClass: 'text-brand-500',
  },
  warning: {
    wrap: 'bg-amber-50 border-amber-200 text-amber-800',
    link: 'text-amber-700 hover:text-amber-900',
    Icon: AlertTriangle,
    iconClass: 'text-amber-500',
  },
  critical: {
    wrap: 'bg-red-50 border-red-200 text-red-800',
    link: 'text-red-700 hover:text-red-900',
    Icon: AlertCircle,
    iconClass: 'text-red-500',
  },
} as const

export default function AnnouncementBanner({ announcement }: { announcement: Announcement | null }) {
  // undefined = storage not read yet. Render nothing until then so the server
  // HTML and first client render match (no hydration mismatch).
  const [dismissed, setDismissed] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    let v: number | null = null
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw !== null && Number.isFinite(Number(raw))) v = Number(raw)
    } catch {
      // Storage unavailable: treated as "never dismissed".
    }
    setDismissed(v)
  }, [])

  if (dismissed === undefined || !announcement || !shouldShowAnnouncement(announcement, dismissed)) return null

  const s = STYLES[announcement.level] ?? STYLES.info
  const href = safeAnnouncementLink(announcement.link_url)

  function dismiss() {
    // State first so it hides for the session even if storage throws.
    setDismissed(announcement!.version)
    try {
      localStorage.setItem(DISMISS_KEY, String(announcement!.version))
    } catch {
      // Ignore: hidden for this session only.
    }
  }

  return (
    <div
      role={announcement.level === 'critical' ? 'alert' : 'status'}
      className={`flex items-center justify-between gap-3 px-4 md:px-6 py-2 border-b text-sm font-medium ${s.wrap}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <s.Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${s.iconClass}`} />
        <span className="min-w-0 break-words">
          {announcement.message}
          {href && (
            <>
              {' '}
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`underline font-bold ${s.link}`}
              >
                {announcement.link_label?.trim() || 'Learn more'}
              </a>
            </>
          )}
        </span>
      </div>
      {announcement.level !== 'critical' && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="flex-shrink-0 -my-2 -mr-3 w-11 h-11 flex items-center justify-center rounded-lg hover:bg-black/5"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
