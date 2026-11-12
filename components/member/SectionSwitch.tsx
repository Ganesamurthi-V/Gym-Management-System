'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'

/** Segmented link switch between sibling member screens; the active pill slides between segments. */
export function SectionSwitch({
  items,
  className,
}: Readonly<{ items: ReadonlyArray<{ href: string; label: string }>; className?: string }>) {
  const pathname = usePathname()

  return (
    <div className={cn('flex gap-1 rounded-full bg-surface-secondary p-1', className)}>
      {items.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-sm',
              active ? 'font-semibold text-slate-900' : 'font-medium text-slate-500',
            )}
          >
            {active && (
              <motion.span
                layoutId="member-section-switch"
                transition={spring}
                className="absolute inset-0 rounded-full bg-surface-card shadow-sm"
              />
            )}
            <span className="relative truncate">{label}</span>
          </Link>
        )
      })}
    </div>
  )
}
