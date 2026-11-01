// The brand logo redrawn as canvas ASCII that decodes on entry and ripples under the cursor, so the mark feels alive without shipping thousands of DOM nodes.
import { useEffect, useRef } from 'react'
import { RAMP, fitCanvas, hasFinePointer, makeLoop, prefersReducedMotion, useLive, usePointer, useTokens } from './useAsciiCanvas'

type Props = { src?: string; cols?: number; className?: string; label?: string; active?: boolean }

const RADIUS = 5 // cells
const DECODE_MS = 900
const DECAY_MS = 400

export function AsciiLogo({ src = '/logo_landspace_without_bg.webp', cols = 64, className, label = 'GymFlow', active }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const api = useRef<{ pulse: (cx?: number, cy?: number, held?: boolean) => void; release: () => void; redraw: () => void; live: (v: boolean) => void } | null>(null)
  const tokens = useTokens(['--foreground', '--accent', '--accent-text'], () => api.current?.redraw())

  useEffect(() => {
    const cv = canvas.current
    const box = wrap.current
    if (!cv || !box) return
    const reduced = prefersReducedMotion()
    let dead = false
    let ch: Uint8Array // ramp index per cell, 0 = blank
    let blue: Uint8Array // 1 = mark (accent), 0 = wordmark (foreground)
    let rows = 0
    let cw = 0
    let live = false
    let decodeStart = reduced ? -Infinity : Infinity // Infinity = not started, glyphs stay scrambled until first on-screen
    const src0 = { cx: 0, cy: 0, level: 0, held: false }
    const rnd = new Float32Array(cols * 200)
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random()

    const draw = (now: number) => {
      const ctx = cv.getContext('2d')
      if (!ctx || !ch) return
      const t = tokens.current
      const ch2 = cw * 2
      ctx.clearRect(0, 0, cols * cw, rows * ch2)
      ctx.font = `${Math.round(ch2 * 0.85)}px ${t.font}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const age = now - decodeStart
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x
          const target = ch[i]
          if (!target) continue
          const px = x * cw + cw / 2
          const py = y * ch2 + ch2 / 2
          const settle = (x / cols) * (DECODE_MS - 250) + rnd[i % rnd.length] * 250
          const dx = x - src0.cx
          const dy = (y - src0.cy) * 2
          const heat = src0.level * Math.max(0, 1 - Math.hypot(dx, dy) / (RADIUS * 2)) ** 1.5
          let idx = target
          if (age < settle) idx = 1 + Math.floor(Math.random() * (RAMP.length - 1))
          else if (heat > 0.03) idx = Math.min(RAMP.length - 1, 1 + Math.floor(Math.random() * RAMP.length * (0.5 + heat)))
          ctx.globalAlpha = age < settle ? 0.55 : 1
          ctx.fillStyle = blue[i] ? t['--accent'] : t['--foreground']
          ctx.fillText(RAMP[idx], px, py)
          if (heat > 0.03) {
            ctx.globalAlpha = Math.min(1, heat * 1.2)
            ctx.fillStyle = t['--accent-text']
            ctx.fillText(RAMP[idx], px, py)
          }
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = makeLoop(15, (now, dt) => {
      if (!src0.held) src0.level = Math.max(0, src0.level - dt / DECAY_MS)
      draw(now)
      if (now - decodeStart > DECODE_MS && src0.level <= 0 && !src0.held) loop.stop()
    })
    const kick = () => {
      if (reduced || !live) return
      loop.start()
    }
    const redraw = () => draw(performance.now())

    const layout = () => {
      if (!ch) return
      cw = box.clientWidth / cols
      fitCanvas(cv, box.clientWidth, rows * cw * 2)
      redraw()
    }

    const img = new Image()
    img.onload = () => {
      if (dead) return
      rows = Math.max(1, Math.round((cols * img.naturalHeight) / img.naturalWidth / 2))
      const off = document.createElement('canvas')
      off.width = cols
      off.height = rows
      const octx = off.getContext('2d', { willReadFrequently: true })
      if (!octx) return
      octx.drawImage(img, 0, 0, cols, rows)
      const d = octx.getImageData(0, 0, cols, rows).data
      ch = new Uint8Array(cols * rows)
      blue = new Uint8Array(cols * rows)
      for (let i = 0; i < ch.length; i++) {
        const [r, g, b, a] = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3] / 255]
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        const dens = a * (1 - 0.6 * lum) // dark ink on a transparent ground: more coverage and darker = denser glyph
        ch[i] = dens < 0.08 ? 0 : Math.max(1, Math.min(RAMP.length - 1, Math.round(dens ** 0.7 * (RAMP.length - 1))))
        blue[i] = b > 150 && b - r > 80 ? 1 : 0
      }
      layout()
      if (live) {
        if (decodeStart === Infinity) decodeStart = performance.now()
        kick()
      }
    }
    img.src = src

    const ro = new ResizeObserver(layout)
    ro.observe(box)

    api.current = {
      redraw,
      pulse(cx = cols / 2, cy = rows / 2, held = false) {
        src0.cx = cx
        src0.cy = cy
        src0.level = 1
        src0.held = held
        kick()
      },
      release() {
        src0.held = false
      },
      live(v) {
        live = v
        if (!v) return loop.stop()
        if (ch && decodeStart === Infinity) decodeStart = performance.now()
        if (ch) kick()
      },
    }
    const onTap = (e: PointerEvent) => {
      if (hasFinePointer() || reduced) return
      const r = cv.getBoundingClientRect()
      api.current?.pulse((e.clientX - r.left) / cw, (e.clientY - r.top) / (cw * 2))
    }
    cv.addEventListener('pointerdown', onTap)
    return () => {
      dead = true
      loop.stop()
      ro.disconnect()
      cv.removeEventListener('pointerdown', onTap)
      api.current = null
    }
  }, [src, cols, tokens])

  useLive(wrap, (v) => api.current?.live(v))

  usePointer(wrap, 'self', (p) => {
    const a = api.current
    if (!a) return
    const cw = (wrap.current?.clientWidth ?? 1) / cols
    if (p) a.pulse(p.x / cw, p.y / (cw * 2), true)
    else a.release()
  })

  useEffect(() => {
    if (active) api.current?.pulse()
  }, [active])

  return (
    <div ref={wrap} role="img" aria-label={label} className={className} style={{ width: '100%' }}>
      <canvas ref={canvas} aria-hidden="true" style={{ display: 'block', width: '100%' }} />
    </div>
  )
}
