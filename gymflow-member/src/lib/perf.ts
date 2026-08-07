/**
 * lib/perf.ts
 *
 * Development-only timing instrumentation.
 *
 * In production these are no-ops so nothing is logged and there is no
 * measurable overhead. `next.config.mjs` also strips `console.log` from
 * production builds, but we gate here too so the timers never even run.
 */

const ENABLED = process.env.NODE_ENV === 'development'

/**
 * Times an async operation and logs the duration in dev.
 *
 * Accepts `PromiseLike` so Supabase's `PostgrestBuilder` (a thenable, not a
 * real Promise) can be passed directly without an extra `await`.
 */
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!ENABLED) return fn()

  const start = performance.now()
  try {
    return await fn()
  } finally {
    const ms = performance.now() - start
    // Padded so the timings line up in the terminal.
    console.log(`[perf] ${label.padEnd(34)} ${ms.toFixed(1).padStart(7)}ms`)
  }
}

/**
 * Starts a timer for a whole page render.
 * Returns a `done()` callback that logs total elapsed time.
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
