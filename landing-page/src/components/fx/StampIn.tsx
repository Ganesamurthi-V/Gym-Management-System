// A small chip settles into place: scale .96 to 1 and a fade in 300ms, once in view. No rotation.
import { type ComponentProps, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type StampInProps = {
  delay?: number
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<'div'>, 'children' | 'className'>

export function StampIn({ delay = 0, className, children, ...rest }: StampInProps) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      initial={{ scale: 0.96, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.3, delay, ease: [0.22, 1, 0.36, 1] }}
      {...(rest as object)}
    >
      {children}
    </motion.div>
  )
}
