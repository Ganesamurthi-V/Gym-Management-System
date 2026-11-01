// Headline words slide up out of a clipped line box; full text stays in aria-label.
import { createElement } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type WordRiseProps = {
  text: string
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span'
  className?: string
  delay?: number
}

export function WordRise({ text, as = 'span', className, delay = 0 }: WordRiseProps) {
  const reduce = useReducedMotion()
  if (reduce) return createElement(as, { className }, text)
  const words = text.split(' ')
  return createElement(
    as,
    { className, 'aria-label': text },
    words.map((w, i) => (
      <span key={i} aria-hidden="true" className="inline-block overflow-clip pb-[0.12em] -mb-[0.12em] align-bottom">
        <motion.span
          className="inline-block"
          initial={{ y: '100%' }}
          whileInView={{ y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.4, delay: delay + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      </span>
    )),
  )
}
