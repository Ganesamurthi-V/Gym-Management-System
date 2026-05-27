/**
 * lib/hooks/useLenisScroll.ts
 * ────────────────────────────
 * Attaches Lenis smooth scroll to a fixed-height sub-container.
 * Also adds a non-passive native wheel listener so the outer page
 * scroll doesn't steal the event when the cursor is inside the box.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null)
 *   useLenisScroll(ref, [deps])
 *
 * The ref must point to the WRAPPER element (overflow: hidden, fixed height).
 * Its first child is used as the Lenis content target.
 */

import { useEffect, RefObject } from 'react'

export function useLenisScroll(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
  orientation: 'vertical' | 'horizontal' = 'vertical'
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let lenis: any = null
    let rafId: number

    async function init() {
      const LenisModule = await import('lenis')
      const Lenis = LenisModule.default
      lenis = new Lenis({
        wrapper:     el as HTMLElement,
        content:     (el as HTMLElement).firstElementChild as HTMLElement,
        duration:    0.9,
        easing:      (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation,
        smoothWheel: true,
      })
      function raf(time: number) {
        lenis.raf(time)
        rafId = requestAnimationFrame(raf)
      }
      rafId = requestAnimationFrame(raf)
    }

    init()

    return () => {
      if (lenis) lenis.destroy()
      cancelAnimationFrame(rafId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
