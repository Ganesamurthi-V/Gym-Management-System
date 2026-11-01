// Slight 3D tilt of a phone/tray toward the pointer on a 150ms ease-out tween; flat on leave, touch and reduced motion.
import { useRef, type ComponentProps, type PointerEvent, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { usePointerFine } from './useInViewOnce'

const tween = { duration: 0.15, ease: 'easeOut' } as const

type TiltFrameProps = {
  max?: number
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<'div'>, 'children' | 'className'>

export function TiltFrame({ max = 2, className, children, ...rest }: TiltFrameProps) {
  const ref = useRef<HTMLDivElement>(null)
  const fine = usePointerFine()
  const reduce = useReducedMotion()
  const rotateY = useMotionValue(0)
  const rotateX = useMotionValue(0)
  const on = fine && !reduce

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    animate(rotateY, px * 2 * max, tween)
    animate(rotateX, -py * 2 * max, tween)
  }
  const leave = () => {
    animate(rotateY, 0, tween)
    animate(rotateX, 0, tween)
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ perspective: 900 }}
      onPointerMove={on ? move : undefined}
      onPointerLeave={on ? leave : undefined}
      {...rest}
    >
      <motion.div style={on ? { rotateX, rotateY, transformStyle: 'preserve-3d' } : undefined}>
        {children}
      </motion.div>
    </div>
  )
}
