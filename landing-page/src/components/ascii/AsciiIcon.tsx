// The owner's ASCII WhatsApp glyph (whatsappArt.ts) with a ripple that radiates from its centre on hover or tap. State changes only while animating, so idle costs nothing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hasFinePointer, prefersReducedMotion } from './useAsciiCanvas'
import { WHATSAPP_ART } from './whatsappArt'

type Props = { name: 'whatsapp'; size?: number; className?: string; label?: string }

const COLS = Math.max(...WHATSAPP_ART.map((r) => r.length))
const ROWS = WHATSAPP_ART.length
const CX = COLS / 2
const CY = ROWS / 2
// The art is drawn on a character grid where a cell is about twice as tall as wide, so row distances count double.
const REACH = Math.hypot(COLS / 2, ROWS)
const BAND = 7
const TOTAL_MS = 1500
const WAVE_MS = 1100

// What a character becomes as the wavefront passes over it: the same family, brighter, so the shape never changes, only its light.
const LIFT: Record<string, string> = { '.': ':', ':': '+', '-': '*', '=': '#' }

const wave = (t: number): string[] => {
  const radius = (Math.min(t, WAVE_MS) / WAVE_MS) * (REACH + BAND)
  return WHATSAPP_ART.map((row, y) =>
    [...row]
      .map((c, x) => {
        const lift = LIFT[c]
        if (!lift || t >= WAVE_MS) return c
        const d = Math.abs(Math.hypot(x - CX, (y - CY) * 2) - radius)
        return d < BAND / 2 ? (d < BAND / 4 ? '@' : lift) : c
      })
      .join(''),
  )
}

export function AsciiIcon({ size = 10, className, label = 'WhatsApp' }: Props) {
  const [t, setT] = useState<number | null>(null)
  const raf = useRef(0)

  const play = useCallback(() => {
    if (prefersReducedMotion() || raf.current) return
    const t0 = performance.now()
    const step = (now: number) => {
      const el = now - t0
      if (el >= TOTAL_MS) {
        raf.current = 0
        setT(null)
        return
      }
      setT(Math.round(el / 40) * 40) // quantised so React re-renders ~25 times a second, not 60
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }, [])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const art = useMemo(() => (t === null ? WHATSAPP_ART : wave(t)).join('\n'), [t])

  return (
    <span
      role="img"
      aria-label={label}
      className={className}
      style={{ display: 'inline-block', color: 'var(--whatsapp-ink)' }}
      onPointerEnter={() => hasFinePointer() && play()}
      onPointerDown={(e) => e.pointerType !== 'mouse' && play()}
    >
      <pre
        aria-hidden="true"
        style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)', fontSize: size, lineHeight: 1, fontWeight: 800, whiteSpace: 'pre', WebkitTextStroke: '0.35px currentColor' }}
      >
        {art}
      </pre>
    </span>
  )
}
