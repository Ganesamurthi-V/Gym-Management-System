'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'

/**
 * three.js is ~120KB gzipped, which is a lot to spend on a background for a sign-in
 * page. ssr: false because it touches document at module scope, and dynamic so the
 * bytes are only fetched once every gate below has passed — a visitor who never
 * qualifies never downloads it.
 */
const CharGrid = dynamic(() => import('./CharGrid').then((m) => m.CharGrid), {
  ssr: false,
})

/** The breakpoint the host panel appears at. Must match its `lg:` classes. */
const PANEL_AT = 1024

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

/**
 * Whether the connection looks like one that should not be spent on decoration.
 *
 * Data Saver is an explicit request to stop sending optional bytes, and a WebGL library
 * for a background is exactly what it means. On 2g the same file is seconds of waiting.
 * This product's audience is largely on Indian mobile data, so the check earns its keep.
 *
 * Read once rather than subscribed: connection changes mid-visit are not worth tearing a
 * canvas down over, and Chromium is the only engine exposing any of this — elsewhere it
 * returns true and the other gates decide.
 */
function connectionAllowsDecoration(): boolean {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection
  if (!conn) return true
  if (conn.saveData) return false
  return conn.effectiveType !== 'slow-2g' && conn.effectiveType !== '2g'
}

function useMediaQuery(query: string): boolean {
  // Starts false and is corrected after mount. The alternative, reading matchMedia
  // during render, differs between server and client and trips hydration.
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * Holds a flag back until the browser is idle, so fetching and compiling a shader cannot
 * compete with the sign-in form's own paint. The form is the reason anyone is on this
 * page; the backdrop can wait.
 *
 * requestIdleCallback where available, a timeout elsewhere. The timeout is a ceiling in
 * both branches: on a busy page idle may never arrive, and the effect should still show.
 */
function useDeferredUntilIdle(enabled: boolean, timeoutMs: number): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled) return

    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (typeof idle.requestIdleCallback === 'function') {
      const handle = idle.requestIdleCallback(() => setReady(true), { timeout: timeoutMs })
      return () => idle.cancelIdleCallback?.(handle)
    }
    const t = window.setTimeout(() => setReady(true), Math.min(timeoutMs, 1200))
    return () => window.clearTimeout(t)
  }, [enabled, timeoutMs])

  return ready
}

/**
 * The character grid as the auth panel's backdrop, carrying the same effect as the
 * marketing hero.
 *
 * Gated four ways, and the width gate is the one that matters most for cost. The host
 * panel is `hidden lg:flex`, so below 1024px it is not on screen at all — without this
 * check the component would still mount inside a display:none parent and pull three.js
 * down for every phone visitor to render nothing. Everyone signing in on a phone now
 * skips the download entirely.
 *
 *  - reduced motion: continuous movement with no user control is exactly what that
 *    preference asks not to see.
 *  - Data Saver or 2g: see connectionAllowsDecoration.
 *  - idle: the form paints first.
 *
 * Ink matches the hero's dark theme: white at the dense end of the ramp, brand-300 at
 * the faint end, so the colour rides the lighter marks while the heavy ones stay at full
 * strength. Values for intensity and contrast are solved for this panel's own geometry
 * rather than copied from the hero — it is a portrait column against the hero's
 * landscape band, and the field's percentiles depend on frame shape.
 */
export function AsciiPanelBackdrop({ className }: { className?: string }) {
  const isPanelVisible = useMediaQuery(`(min-width: ${PANEL_AT}px)`)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const connectionOk = useMemo(() => connectionAllowsDecoration(), [])

  const wanted = isPanelVisible && !reducedMotion && connectionOk
  const ready = useDeferredUntilIdle(wanted, 2000)

  if (!wanted || !ready) return null

  return (
    <CharGrid
      className={className}
      color="#ffffff"
      colorTint="#93c5fd"
      size={10}
      scale={4}
      speed={1}
      /* Solved against this panel's 80x90 cell grid for 28% of cells empty and 34%
         carrying a heavy mark, the same distribution the hero settled on. */
      intensity={1.115}
      contrast={2.298}
      waveTension={0.5}
      waveTwist={0.1}
      maxPixelRatio={1.25}
      targetFps={24}
    />
  )
}

export default AsciiPanelBackdrop
