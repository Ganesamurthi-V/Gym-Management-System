import Link from 'next/link'
import { ChevronRight, Trophy } from 'lucide-react'

/**
 * Entry point to `/m/leaderboard` from Home and Rewards.
 *
 * The leaderboard has no bottom-nav tab (five tabs is the limit on a 360px
 * phone, see BottomNav), so this card is how members find it. Callers render it
 * only when the gym has leaderboards on: a card that leads to "switched off"
 * would be a dead end.
 */
export function LeaderboardEntryCard({ className }: { className?: string }) {
  return (
    <Link
      href="/m/leaderboard"
      // Dynamic routes are only prefetched when asked; without this the first
      // tap pays a cold server round trip (same reason as BottomNav).
      prefetch
      className={`card flex items-center gap-3 rounded-2xl p-4 transition-all active:scale-[0.98] ${className ?? ''}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
        <Trophy aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">Leaderboard</span>
        <span className="mt-0.5 block text-xs text-slate-500">See how you rank at your gym</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
    </Link>
  )
}
