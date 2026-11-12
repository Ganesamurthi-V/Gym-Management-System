'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  className,
  trackClassName = 'text-slate-100',
  label,
  children,
}: Readonly<{
  value: number
  size?: number
  strokeWidth?: number
  className?: string
  trackClassName?: string
  label?: string
  children?: ReactNode
}>) {
  const reduce = useReducedMotion()
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const target = c * (1 - v)

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        className={cn('-rotate-90', className)}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={trackClassName} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? target : c }}
          animate={{ strokeDashoffset: target }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.2, 0, 0, 1] }}
        />
      </svg>
      {children ? <div className="absolute inset-0 flex items-center justify-center">{children}</div> : null}
    </div>
  )
}
