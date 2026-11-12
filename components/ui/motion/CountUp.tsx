'use client'

import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Renders the final value on the server (no-JS / SSR shows the right number),
 * then counts up from 0 on mount by writing textContent directly, so there is
 * no re-render per frame.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: Readonly<{ value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }>) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return
    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.2, 0, 0, 1],
      onUpdate: (n) => {
        el.textContent = `${prefix}${n.toFixed(decimals)}${suffix}`
      },
    })
    return () => controls.stop()
  }, [value, decimals, prefix, suffix, reduce])

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {`${prefix}${value.toFixed(decimals)}${suffix}`}
    </span>
  )
}
