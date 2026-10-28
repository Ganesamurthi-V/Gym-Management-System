'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { isNewVisit, normalizeActivityPath, shouldLogPageView } from '@/lib/activity/normalize'

const LAST_ACTIVITY_KEY = 'gf-owner-last-activity'

function readLastActivity(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_ACTIVITY_KEY))
    return v > 0 ? v : null
  } catch { return null }
}

function touchLastActivity(now: number) {
  try { localStorage.setItem(LAST_ACTIVITY_KEY, String(now)) } catch { /* storage unavailable */ }
}

function send(kind: 'app_open' | 'page_view', path: string) {
  const platform =
    window.innerWidth < 768 || /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
  // Fire and forget: keepalive lets it finish during navigation; the header is the CSRF signal.
  fetch('/api/owner/activity', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ kind, path, platform }),
  }).catch(() => {})
}

/** Records app opens and page views for the owner activity log. Renders nothing. */
export default function ActivityBeacon() {
  const pathname = usePathname()
  const last = useRef<{ path: string; at: number } | null>(null)

  function log(path: string) {
    if (document.visibilityState === 'hidden') return
    const now = Date.now()
    if (!shouldLogPageView(last.current, path, now)) return
    if (isNewVisit(readLastActivity(), now)) send('app_open', path)
    send('page_view', path)
    last.current = { path, at: now }
    touchLastActivity(now)
  }

  useEffect(() => {
    const path = normalizeActivityPath(pathname)
    if (path) log(path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Coming back to the tab keeps a long session alive, or starts a new visit after a long absence.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const path = normalizeActivityPath(window.location.pathname)
      if (!path) return
      const now = Date.now()
      if (isNewVisit(readLastActivity(), now)) {
        send('app_open', path)
        send('page_view', path)
        last.current = { path, at: now }
      }
      touchLastActivity(now)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return null
}
