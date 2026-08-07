/**
 * lib/perf.ts
 *
 * Development-only timing instrumentation for the server render path.
 *
 * In production these are no-ops, so nothing is logged and the timers never
 * even run. (`next.config.js` also strips `console.log` from production
 * builds, but gating here avoids the work entirely.)
 *
 * This is deliberately separate from `lib/performance.ts` (the
 * `PerformanceMetrics` class used by API routes for Server-Timing headers) —
 * these helpers are for wrapping individual awaits inside Server Components.
 */

const ENABLED = process.env.NODE_ENV === 'development'

/**
 * Times an async operation and logs the duration in dev.
 *
 * Accepts `PromiseLike` so a Supabase `PostgrestBuilder` (a thenable, not a
 * real Promise) can be passed directly.
 */
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!ENABLED) return fn()

  const start = performance.now()
  try {
    return await fn()
  } finally {
    const ms = performance.now() - start
    console.log(`[perf] ${label.padEnd(34)} ${ms.toFixed(1).padStart(7)}ms`)
  }
}

/**
 * Starts a timer for a whole page render.
 * Returns a `done()` callback that logs the total elapsed time.
 */
export function startPageTimer(page: string) {
  if (!ENABLED) return () => {}

  const start = performance.now()
  console.log(`[perf] ─── ${page} render start ───`)

  return () => {
    const ms = performance.now() - start
    console.log(`[perf] ═══ ${page.padEnd(30)} TOTAL ${ms.toFixed(1).padStart(7)}ms ═══`)
  }
}
