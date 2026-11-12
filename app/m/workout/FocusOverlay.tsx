'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Full-screen focus mode for a live workout. Portalled to <body> so it covers the bottom nav and
 * top bar (both are inside the page shell), and locks body scroll while open.
 */
export default function FocusOverlay({ children }: Readonly<{ children: React.ReactNode }>) {
  // Portals need `document`: render nothing on the server and on the first client pass.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-overlay)] overflow-y-auto bg-surface">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
        {children}
      </div>
    </div>,
    document.body,
  )
}
