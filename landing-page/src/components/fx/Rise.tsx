// A block rises 12px and fades in once on scroll: 500ms on an ease-out curve, no spring.
import { createElement, type ComponentProps, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type Tag = keyof React.JSX.IntrinsicElements

type RiseProps = {
  as?: Tag
  delay?: number
  distance?: number
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<'div'>, 'as' | 'children' | 'className'>

export function Rise({ as = 'div', delay = 0, distance = 12, className, children, ...rest }: RiseProps) {
  const reduce = useReducedMotion()
  if (reduce) return createElement(as, { className, ...rest }, children)
  const M = motion[as as 'div'] as typeof motion.div
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      {...(rest as object)}
    >
      {children}
    </M>
  )
}
