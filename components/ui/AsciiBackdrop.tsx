'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'

/**
 * three.js is ~120KB gzipped, which is a lot to spend on a background. ssr: false
 * because it touches document at module scope, and dynamic so the bytes are only
 * fetched once every gate below has passed — a visitor who never qualifies never
 * downloads it.
 */
const CharGrid = dynamic(() => import('./CharGrid').then((m) => m.CharGrid), {
  ssr: false,
})

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
  // Starts false and is corrected after mount. Reading matchMedia during render would
  // differ between server and client and trip hydration.
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
 * compete with the page's own paint. On an auth page the form is the reason anyone is
 * here; the backdrop can wait.
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

export interface AsciiBackdropProps {
  className?: string
  /** Ink for the dense end of the ramp, where the heaviest glyphs are. */
  color?: string
  /** Ink for the faint end, mixed out toward `color` as cells get denser. */
  colorTint?: string
  scale?: number
  intensity?: number
  contrast?: number
  /**
   * Viewport width below which nothing mounts, in px.
   *
   * Not only a cosmetic choice. Below this the library is never fetched, so the default
   * of 768 means every phone visitor skips ~120KB gzipped for a background they were
   * never going to dwell on. Raise it where the host element is itself hidden at small
   * widths, or the component would mount inside a display:none parent and pay the
   * download to render nothing.
   */
  minWidth?: number
}

/**
 * The character grid, gated so it only ever costs anything when it will be seen.
 *
 *  - width: see minWidth.
 *  - reduced motion: continuous movement with no user control is exactly what that
 *    preference asks not to see.
 *  - Data Saver or 2g: see connectionAllowsDecoration.
 *  - idle: the page's own content paints first.
 *
 * Nothing is rendered until all four pass, and nothing is downloaded either.
 */
export function AsciiBackdrop({
  className,
  color = '#000000',
  colorTint,
  scale = 4,
  intensity = 1.099,
  contrast = 2.501,
  minWidth = 768,
}: AsciiBackdropProps) {
  const wideEnough = useMediaQuery(`(min-width: ${minWidth}px)`)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const connectionOk = useMemo(() => connectionAllowsDecoration(), [])

  const wanted = wideEnough && !reducedMotion && connectionOk
  const ready = useDeferredUntilIdle(wanted, 2000)

  if (!wanted || !ready) return null

  return (
    <CharGrid
      className={className}
      color={color}
      colorTint={colorTint}
      size={10}
      scale={scale}
      speed={1}
      intensity={intensity}
      contrast={contrast}
      waveTension={0.5}
      waveTwist={0.1}
      maxPixelRatio={1.25}
      targetFps={24}
    />
  )
}

export default AsciiBackdrop
