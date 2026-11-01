// Hero background of drifting ASCII noise on a character grid, tinted by token and faded in code, so the ground reads as the product's own signal without any image.
import { useEffect, useRef } from 'react'
import { fitCanvas, makeLoop, prefersReducedMotion, useLive, usePointer, useTokens } from './useAsciiCanvas'

type Props = { className?: string; cell?: [number, number]; height?: number; intensity?: number }

const GLYPHS = ' .:-=+*#'
const NEAR = 120 // px of pointer influence

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
const smooth = (t: number) => t * t * (3 - 2 * t)
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = smooth(x - xi)
  const v = smooth(y - yi)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function AsciiField({ className, cell, height = 720, intensity = 0.55 }: Props) {
  const cw = cell?.[0] ?? 8 // numbers, not the array, are effect deps: a fresh [8,16] literal each render must not restart the canvas
  const chh = cell?.[1] ?? 16
  const canvas = useRef<HTMLCanvasElement>(null)
  const ptr = useRef<{ x: number; y: number } | null>(null)
  const api = useRef<{ redraw: () => void; live: (v: boolean) => void } | null>(null)
  const tokens = useTokens(['--border-strong', '--accent', '--accent-text'], () => api.current?.redraw())

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const reduced = prefersReducedMotion()
    let cols = 0
    let rows = 0
    let t0 = performance.now()

    const draw = (now: number) => {
      const ctx = cv.getContext('2d')
      if (!ctx || !cols) return
      const t = tokens.current
      const time = reduced ? 0 : (now - t0) / 1000
      ctx.clearRect(0, 0, cols * cw, rows * chh)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const base = `${Math.round(chh * 0.8)}px ${t.font}`
      const big = `${Math.round(chh * 1.1)}px ${t.font}`
      ctx.font = base
      const p = ptr.current
      for (let y = 0; y < rows; y++) {
        const ry = y / rows
        const rowA = ry > 0.35 ? Math.max(0, 1 - (ry - 0.35) / 0.65) ** 1.6 : 1 // fades to zero toward the bottom
        if (rowA <= 0.02) break
        for (let x = 0; x < cols; x++) {
          const rx = x / cols
          const edge = Math.min(1, Math.min(rx, 1 - rx) / 0.12) // fades toward left and right edges
          let v = vnoise(x * 0.07 + time * 0.35, y * 0.12 - time * 0.18) * 0.65 + vnoise(x * 0.19 - time * 0.5, y * 0.3) * 0.35
          v = Math.max(0, (v - 0.3) / 0.7) * rowA * edge
          const px = x * cw + cw / 2
          const py = y * chh + chh / 2
          let near = 0
          if (p) near = Math.max(0, 1 - Math.hypot(px - p.x, py - p.y) / NEAR)
          const lvl = Math.min(GLYPHS.length - 1, Math.floor((v + near * 0.6 * edge) * GLYPHS.length * (0.6 + intensity)))
          if (lvl <= 0) continue
          const ch = near > 0.1 ? GLYPHS[1 + Math.floor(Math.random() * (GLYPHS.length - 1))] : GLYPHS[lvl]
          ctx.fillStyle = lvl >= 6 ? t['--accent-text'] : lvl >= 3 ? t['--accent'] : t['--border-strong']
          ctx.globalAlpha = Math.min(1, (lvl >= 6 ? 0.55 : lvl >= 3 ? 0.3 : 0.45) * (0.5 + intensity) * (0.5 + near))
          if (near > 0.1) {
            ctx.font = big
            ctx.fillText(ch, px, py)
            ctx.font = base
          } else ctx.fillText(ch, px, py)
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = makeLoop(12, draw)
    const layout = () => {
      const w = cv.parentElement?.clientWidth ?? cv.clientWidth
      if (!w) return
      cols = Math.floor(w / cw)
      rows = Math.ceil(height / chh)
      fitCanvas(cv, w, rows * chh)
      draw(performance.now())
    }
    layout()
    const ro = new ResizeObserver(layout)
    if (cv.parentElement) ro.observe(cv.parentElement)

    api.current = {
      redraw: () => draw(performance.now()),
      live(v) {
        if (reduced) return
        if (v) loop.start()
        else loop.stop()
      },
    }
    t0 = performance.now()
    return () => {
      loop.stop()
      ro.disconnect()
      api.current = null
    }
  }, [cw, chh, height, intensity, tokens])

  useLive(canvas, (v) => api.current?.live(v))
  usePointer(canvas, 'window', (p) => {
    ptr.current = p
  })

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height, pointerEvents: 'none' }}
    />
  )
}
