// Pointer-attracted wrapper for a CTA; follows the cursor on a 150ms ease-out tween, rests on leave.
import { useRef, type ComponentProps, type PointerEvent, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { usePointerFine } from './useInViewOnce'

const tween = { duration: 0.15, ease: 'easeOut' } as const

type MagnetProps = {
  strength?: number
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<'div'>, 'children' | 'className'>

export function Magnet({ strength = 0.2, className, children, ...rest }: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const fine = usePointerFine()
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const on = fine && !reduce

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    animate(x, (e.clientX - (r.left + r.width / 2)) * strength, tween)
    animate(y, (e.clientY - (r.top + r.height / 2)) * strength, tween)
  }
  const leave = () => {
    animate(x, 0, tween)
    animate(y, 0, tween)
  }

  return (
    <div
      ref={ref}
      className={className}
      onPointerMove={on ? move : undefined}
      onPointerLeave={on ? leave : undefined}
      {...rest}
    >
      <motion.div style={on ? { x, y } : undefined}>{children}</motion.div>
    </div>
  )
}
