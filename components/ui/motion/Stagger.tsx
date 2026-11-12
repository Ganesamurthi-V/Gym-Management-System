import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Children entrance delays come from `.stagger > *:nth-child(n)` in globals.css (40ms step, capped at 12). */
export function Stagger({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={cn('stagger', className)}>{children}</div>
}

export function StaggerItem({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={cn('animate-rise-in', className)}>{children}</div>
}
