/**
 * lib/tours/tour-state.ts
 * ───────────────────────
 * Tiny client-side flag telling the rest of the owner console that a guided tour
 * is running.
 *
 * WHY THIS EXISTS
 * ---------------
 * Driver.js caches the DOM element it is highlighting. Two background loops in
 * this app replace that element underneath it:
 *
 *   1. `ShellGuard` polls `/api/account/status` every 30 s and pushes the result
 *      into React state.
 *   2. `useRealtimeChannel` calls `onResync()` on an interval and whenever the
 *      tab is foregrounded; for owner pages that is `router.refresh()`, which
 *      re-renders the Server Component subtree and swaps out the highlighted
 *      node.
 *
 * When that happens mid-tour the spotlight detaches from its target and the
 * overlay is left highlighting empty space. Standing the loops down for the
 * ~2 minutes a tour lasts is cheaper and far more reliable than trying to
 * re-attach with `driverObj.refresh()` on a timer. A short window of stale data
 * is harmless; a broken overlay is not.
 *
 * Deliberately a module-level flag rather than React context: the consumers are
 * a shell guard and a low-level polling hook that sit above (and outside) any
 * provider the tour could reasonably own, and they only need to *read* the value
 * during a callback, not re-render when it changes.
 *
 * Client-only. Never import this from a Server Component — module state there is
 * per-request and shared across users.
 */

let tourActive = false

type Listener = (active: boolean) => void
const listeners = new Set<Listener>()

/** Whether a guided tour is currently on screen. */
export function isTourActive(): boolean {
  return tourActive
}

/** Flip the flag. No-ops when the value is unchanged. */
export function setTourActive(active: boolean): void {
  if (tourActive === active) return
  tourActive = active
  for (const listener of listeners) {
    try {
      listener(active)
    } catch {
      // A misbehaving listener must never break tour teardown.
    }
  }
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribeTourActive(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ── Replay signal ───────────────────────────────────────────────────────────
//
// "Take the tour again" lives in the account menu, which is a sibling of
// `TourLauncher` in the shell rather than an ancestor, so it cannot call into the
// tour directly.
//
// Routing to `/owner/dashboard?tour=replay` does not work either: an owner who is
// already on the dashboard would only change the query string, and the launcher
// deliberately decides whether to start at most once per mount. A full page load
// would work but throws away the client cache for what is a purely client-side
// action.
//
// So the menu raises a signal and the launcher, which owns the tour, acts on it.
// Starting the tour already navigates to the first chapter's route, so this works
// from any owner page.

type RestartListener = () => void
const restartListeners = new Set<RestartListener>()

/** Ask the mounted launcher to start the tour from the beginning. */
export function requestTourRestart(): void {
  for (const listener of restartListeners) {
    try {
      listener()
    } catch {
      // Never let a failed restart break the menu that triggered it.
    }
  }
}

/** Subscribe to replay requests. Returns an unsubscribe function. */
export function subscribeTourRestart(listener: RestartListener): () => void {
  restartListeners.add(listener)
  return () => {
    restartListeners.delete(listener)
  }
}
