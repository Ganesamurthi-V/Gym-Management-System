'use client'

import Link from 'next/link'
import { BarChart3, Dumbbell, Home, Trophy, UserRound } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'

/**
 * Five tabs is the limit on a 360px phone: a sixth leaves 60px per tab, which
 * cannot fit an 11px "Leaderboard" label and squeezes the tap targets. So the
 * leaderboard has no tab of its own; it is reached from cards on Home and
 * Rewards, and `alsoActiveFor` keeps the Rewards tab lit while it is open so
 * the member still sees where they are.
 */
const navItems: ReadonlyArray<{
  href: string
  label: string
  icon: typeof Home
  alsoActiveFor?: readonly string[]
}> = [
  { href: '/m/home', label: 'Home', icon: Home },
  { href: '/m/workout', label: 'Workout', icon: Dumbbell },
  { href: '/m/progress', label: 'Progress', icon: BarChart3 },
  { href: '/m/rewards', label: 'Rewards', icon: Trophy, alsoActiveFor: ['/m/leaderboard'] },
  { href: '/m/profile', label: 'Profile', icon: UserRound },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary navigation"
      // Floats above the safe area; MemberShell's bottom padding adds the same 0.75rem.
      style={{ bottom: 'calc(var(--pwa-safe-bottom, 0px) + 0.75rem)' }}
      className="fixed inset-x-0 z-[var(--z-sticky)] mx-4"
    >
      <div className="mx-auto flex h-[var(--bottom-nav-height)] max-w-md items-center gap-1 rounded-full border border-surface-border bg-surface-card/90 p-1.5 shadow-lg shadow-ink-950/10 backdrop-blur-md">
        {navItems.map(({ href, label, icon: Icon, alsoActiveFor }) => {
          const active = [href, ...(alsoActiveFor ?? [])].some(
            (base) => pathname === base || pathname.startsWith(`${base}/`),
          )
          return (
            <Link
              key={href}
              href={href}
              // Explicitly prefetch every tab. Next.js only prefetches dynamic
              // routes when `prefetch` is set to `true`, so the default was a
              // no-op here and each tap paid a full cold server round trip.
              // With this, the RSC payload is already in the Router Cache by
              // the time the user taps.
              prefetch
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              // Active tab grows (flex-[2]) to fit icon + label; inactive tabs are icon only.
              className={cn(
                'relative flex h-full min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-full px-2 transition-[flex-grow] duration-200',
                active ? 'flex-[2.2] font-semibold text-white' : 'flex-1 text-slate-400',
              )}
            >
              {active && (
                <motion.span
                  layoutId="member-nav-blob"
                  transition={spring}
                  className="absolute inset-0 rounded-full bg-brand-500"
                />
              )}
              <Icon aria-hidden="true" className="relative h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
              {active && <span className="relative truncate text-xs leading-none">{label}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
