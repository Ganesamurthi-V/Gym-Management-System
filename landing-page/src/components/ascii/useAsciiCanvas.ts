// Shared helpers for the ASCII kit: tokens, DPR sizing, visibility and pointer, kept here so each canvas stays small and none hardcodes a colour.
import { useEffect, useRef, type RefObject } from 'react'

export const RAMP = ' .:-=+*#%@'

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const hasFinePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

/** Reads CSS custom properties from :root; re-reads when the `dark` class flips, so canvases follow the theme. */
export function useTokens(names: string[], onChange: () => void) {
  const tokens = useRef<Record<string, string>>({})
  const cb = useRef(onChange)
  cb.current = onChange
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      for (const n of names) tokens.current[n] = cs.getPropertyValue(n).trim()
      tokens.current.font = cs.getPropertyValue('--font-mono').trim() || 'monospace'
    }
    read()
    const mo = new MutationObserver(() => {
      read()
      cb.current()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return tokens
}

/** Sizes the canvas backing store to its CSS box at DPR (capped at 2) and returns the scale applied. */
export function fitCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

/** Fires `onLive(true)` only while the element is on screen AND the tab is visible, so loops never run off screen. */
export function useLive(ref: RefObject<Element | null>, onLive: (live: boolean) => void) {
  const cb = useRef(onLive)
  cb.current = onLive
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let inView = false
    let last = false
    const emit = () => {
      const live = inView && document.visibilityState === 'visible'
      if (live !== last) {
        last = live
        cb.current(live)
      }
    }
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting
      emit()
    })
    io.observe(el)
    document.addEventListener('visibilitychange', emit)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', emit)
    }
  }, [ref])
}

/** rAF loop throttled to `fps`; start/stop are idempotent so callers run it only while something is animating. */
export function makeLoop(fps: number, frame: (now: number, dt: number) => void) {
  let raf = 0
  let prev = 0
  const step = (now: number) => {
    raf = requestAnimationFrame(step)
    if (now - prev < 1000 / fps) return
    const dt = prev ? now - prev : 1000 / fps
    prev = now
    frame(now, dt)
  }
  return {
    start() {
      if (!raf) raf = requestAnimationFrame(step)
    },
    stop() {
      cancelAnimationFrame(raf)
      raf = 0
      prev = 0
    },
    running: () => raf !== 0,
  }
}

/** Pointer position in CSS px relative to `el`, or null when outside; fine pointers only (touch gets static art). */
export function usePointer(
  ref: RefObject<HTMLElement | null>,
  target: 'self' | 'window',
  onMove: (p: { x: number; y: number } | null) => void,
) {
  const cb = useRef(onMove)
  cb.current = onMove
  useEffect(() => {
    const el = ref.current
    if (!el || !hasFinePointer() || prefersReducedMotion()) return
    const src: EventTarget = target === 'window' ? window : el
    const move = (e: Event) => {
      const r = el.getBoundingClientRect()
      const { clientX, clientY } = e as PointerEvent
      const x = clientX - r.left
      const y = clientY - r.top
      cb.current(x >= 0 && y >= 0 && x <= r.width && y <= r.height ? { x, y } : null)
    }
    const leave = () => cb.current(null)
    src.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      src.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [ref, target])
}
