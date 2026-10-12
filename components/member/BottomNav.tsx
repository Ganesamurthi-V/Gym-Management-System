'use client'

import Link from 'next/link'
import { BarChart3, Dumbbell, Home, Trophy, UserRound } from 'lucide-react'
import { usePathname } from 'next/navigation'

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
    <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-surface-border bg-surface/90 backdrop-blur-md pb-safe-bottom">
      <div className="mx-auto flex h-[var(--bottom-nav-height)] max-w-lg items-stretch">
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
              className={`flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors ${active ? 'font-semibold text-brand-600' : 'text-slate-400'}`}
            >
              <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[0.6875rem] leading-none xs:text-xs">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
