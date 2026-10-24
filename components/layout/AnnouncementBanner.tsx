'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { Info, AlertTriangle, AlertCircle, X } from 'lucide-react'
import {
  buildAnnouncementParts,
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

  const visible = dismissed !== undefined && !!announcement && shouldShowAnnouncement(announcement, dismissed)
  const ref = useRef<HTMLDivElement>(null)

  // Publish the banner's live height (it wraps to 2-3 lines on a phone) as
  // --gf-banner-h so the fixed sidebar and sticky header can sit below it.
  // Unset when hidden, so the shell is unchanged without an announcement.
  useEffect(() => {
    const el = ref.current
    if (!visible || !el) return
    const root = document.documentElement
    const set = () => root.style.setProperty('--gf-banner-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--gf-banner-h')
    }
  }, [visible])

  if (!visible || !announcement) return null

  const s = STYLES[announcement.level] ?? STYLES.info
  const parts = buildAnnouncementParts(announcement)

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
    // Sticky at the very top of the shell, above sidebar and header. Symmetric
    // px-12 keeps the centred text clear of the absolute 44px dismiss button.
    <div
      ref={ref}
      role={announcement.level === 'critical' ? 'alert' : 'status'}
      className={`sticky top-0 z-40 px-12 py-2 border-b text-sm font-medium text-center ${s.wrap}`}
    >
      <div className="flex items-start justify-center gap-2 min-w-0">
        <s.Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${s.iconClass}`} />
        <span className="min-w-0 break-words">
          {parts.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && ' '}
              {p.kind === 'link' ? (
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline font-bold ${s.link}`}
                >
                  {p.text}
                </a>
              ) : (
                p.text
              )}
            </Fragment>
          ))}
        </span>
      </div>
      {announcement.level !== 'critical' && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg hover:bg-black/5"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
