// Staggers its direct children with the same rise, once in view.
import { Children, type ComponentProps, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type RiseGroupProps = {
  stagger?: number
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<'div'>, 'children' | 'className'>

export function RiseGroup({ stagger = 0.06, className, children, ...rest }: RiseGroupProps) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className} {...rest}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '-10% 0px' }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: stagger } } }}
      {...(rest as object)}
    >
      {Children.map(children, (child) => (
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}
