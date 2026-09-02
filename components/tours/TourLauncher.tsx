'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import 'driver.js/dist/driver.css'
import './driver-theme.css'

import { api } from '@/lib/api/client'
import {
  sanitizeTourProgress,
  shouldAutoStartTour,
  shouldResumeTour,
} from '@/lib/tours/progress'
import { subscribeTourRestart } from '@/lib/tours/tour-state'
import { useOwnerTour } from '@/lib/tours/useOwnerTour'

/**
 * components/tours/TourLauncher.tsx
 * ────────────────────────────────
 * Decides whether the guided tour should run, and starts it. Renders nothing.
 *
 * Mounted once inside `ShellGuard`, so it survives every `/owner/*` navigation
 * and the tour it owns can span pages without restarting.
 *
 * WHY IT ONLY EVER TRIGGERS ON THE DASHBOARD
 * ------------------------------------------
 * The dashboard is where an owner lands after setup and where they start their
 * day. Auto-starting anywhere else would mean an owner who abandoned the tour on
 * the payments chapter gets pulled off the members page — mid-task — the next
 * time they open it. Resuming from the natural entry point is helpful; resuming
 * on top of real work is not. Replay from the account menu is explicit, so it
 * works from anywhere.
 */

const TOUR_HOME = '/owner/dashboard'
const OWNER_PREFIX = '/owner/'

/** `?tour=` values that force a start, regardless of saved progress. */
const TRIGGERS = new Set(['welcome', 'replay'])

/**
 * Let the dashboard's own entrance animation finish before the overlay appears.
 * The first step is centred and needs no element, so this is purely cosmetic.
 */
const WELCOME_DELAY_MS = 700
const RESUME_DELAY_MS = 400

/**
 * Whether the start decision has already been made for this page load.
 *
 * Module scope, not a ref, on purpose. React Strict Mode mounts, unmounts and
 * remounts effects in development; a per-mount ref would be set on the first
 * pass, have its in-flight progress lookup cancelled by the intervening cleanup,
 * and then short-circuit the second pass — so the tour would silently never
 * start in dev. A module flag survives that remount, and still resets on a real
 * page load, which is the granularity we actually want: decide once per session,
 * not once per navigation.
 */
let decidedThisPageLoad = false

export default function TourLauncher() {
  const pathname = usePathname()
  const router = useRouter()

  // Background polling stands down during a tour (see lib/tours/tour-state.ts),
  // so refresh once it ends to pick up anything missed.
  const { startTour } = useOwnerTour({ onEnd: () => router.refresh() })

  // "Take the tour again" from the account menu. Clickable on any owner page,
  // including the dashboard itself — where a router push would not change the
  // route and so would not re-run the effect below.
  useEffect(
    () =>
      subscribeTourRestart(() => {
        decidedThisPageLoad = true
        void startTour({ delayMs: RESUME_DELAY_MS })
      }),
    [startTour],
  )

  useEffect(() => {
    if (pathname !== TOUR_HOME || decidedThisPageLoad) return
    decidedThisPageLoad = true

    // Read the trigger from `window.location` rather than `useSearchParams()`:
    // we need `history.replaceState` here anyway, and this keeps the component
    // clear of the Suspense/CSR-bailout rules `useSearchParams` brings with it.
    const params = new URLSearchParams(window.location.search)
    const trigger = params.get('tour')

    if (trigger && TRIGGERS.has(trigger)) {
      // Strip the parameter so a refresh, or a copied URL, does not restart it.
      params.delete('tour')
      const query = params.toString()
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      )
      void startTour({ delayMs: WELCOME_DELAY_MS })
      return
    }

    void (async () => {
      try {
        const response = await api.get<{ data: unknown }>('/api/tours')

        // Deliberately not tied to this effect's cleanup — see the note on
        // `decidedThisPageLoad`. Checking that we are still inside the owner
        // console is the guard that actually matters, and it holds whether the
        // remount came from Strict Mode or the owner navigating away.
        if (!window.location.pathname.startsWith(OWNER_PREFIX)) return

        const progress = sanitizeTourProgress(response?.data)

        if (shouldAutoStartTour(progress)) {
          void startTour({ delayMs: WELCOME_DELAY_MS })
        } else if (shouldResumeTour(progress) && progress.chapterId) {
          void startTour({
            from: { chapterId: progress.chapterId, stepIndex: progress.stepIndex },
            delayMs: RESUME_DELAY_MS,
          })
        }
      } catch {
        // The tour is a nice-to-have. If progress cannot be read — offline, rate
        // limited, whatever — the dashboard must still work untouched.
      }
    })()
  }, [pathname, startTour])

  return null
}
