// A soft light follows the pointer inside a panel (fine pointers only). The glow is the .spot-glow layer in
// src/index.css; this component only feeds it the pointer position. Fades in over 200ms on hover; absent on touch
// and under reduced motion.
import { useRef, type ComponentProps, type PointerEvent, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { usePointerFine } from './useInViewOnce'

type SpotlightSurfaceProps = {
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<'div'>, 'children' | 'className'>

export function SpotlightSurface({ className, children, onPointerMove, ...rest }: SpotlightSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null)
  const fine = usePointerFine()
  const reduce = useReducedMotion()
  const on = fine && !reduce

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (el) {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    onPointerMove?.(e)
  }

  return (
    <div
      ref={ref}
      className={`spot relative ${className ?? ''}`}
      onPointerMove={on ? move : onPointerMove}
      {...rest}
    >
      {on && <div aria-hidden="true" className="spot-glow" />}
      {children}
    </div>
  )
}
