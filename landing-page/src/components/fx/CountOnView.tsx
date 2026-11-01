// Number that counts up once in view by writing to a text node; final value is the static render.
import { useEffect, useRef } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'

type CountOnViewProps = {
  to: number
  from?: number
  duration?: number
  format?: (n: number) => string
  className?: string
}

const defaultFormat = (n: number) => String(Math.round(n))

export function CountOnView({ to, from = 0, duration = 0.9, format = defaultFormat, className }: CountOnViewProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const reduce = useReducedMotion()
  // Keep the latest formatter without re-running the animation when callers pass inline functions.
  const fmt = useRef(format)
  fmt.current = format

  useEffect(() => {
    const el = ref.current
    if (!inView || reduce || !el) return
    const controls = animate(from, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = fmt.current(v)
      },
      onComplete: () => {
        el.textContent = fmt.current(to)
      },
    })
    return () => controls.stop()
  }, [inView, reduce, from, to, duration])

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ''}`}>
      {format(to)}
    </span>
  )
}
