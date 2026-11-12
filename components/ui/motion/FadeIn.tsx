import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * CSS-keyframe entrance, no 'use client': server-rendered content must never sit
 * at opacity 0 waiting for hydration on a slow connection.
 */
export function FadeIn({ children, delay, className }: Readonly<{ children: ReactNode; delay?: number; className?: string }>) {
  return (
    <div className={cn('animate-rise-in', className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  )
}
