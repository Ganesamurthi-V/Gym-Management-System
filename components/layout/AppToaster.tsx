'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'react-hot-toast'

/**
 * Single global toast container for the unified app.
 *
 * There can only be one mounted `<Toaster />` — react-hot-toast renders every
 * toast into *every* container, so mounting one per subtree would duplicate
 * each notification. Instead this reads the current path and places the single
 * container where each experience expects it: top-right for the owner console
 * (beside the account menu) and top-center for the member PWA (thumb-safe,
 * below the status bar).
 */
export function AppToaster() {
  const pathname = usePathname()

  const isMobileExperience =
    pathname === '/m' ||
    pathname.startsWith('/m/') ||
    pathname.startsWith('/activate')

  return (
    <Toaster
      position={isMobileExperience ? 'top-center' : 'top-right'}
      toastOptions={{ duration: 4000 }}
    />
  )
}
