import { Flame, Hourglass } from 'lucide-react'
import { STREAK_PENDING_LABEL, formatCount } from '@/lib/gamification/leaderboardDisplay'

/**
 * The one way a streak is drawn in the member app (Home, Rewards, Progress and
 * the leaderboard), so the pending state can never differ between screens.
 *
 * RULES IT ENCODES
 * - The number is the count of days actually attended. Today is never added in
 *   advance: on check-in the count goes up by one and the hourglass goes away.
 * - `pending` (the RPC's `streak_pending`) means the streak is alive but today
 *   has no check-in yet. It is shown as an amber hourglass with one fixed line
 *   of copy. Nothing here may state or hint at a deadline: no time, no
 *   countdown. The server decides when a streak ends; the UI only relays the flag.
 *
 * No hooks and no 'use client', so it renders in Server Components and inside
 * client components alike.
 */

type Size = 'sm' | 'md' | 'lg'

const SIZES: Record<Size, { number: string; flame: string; hourglass: string; label: string }> = {
  sm: { number: 'text-xs font-bold', flame: 'h-3.5 w-3.5', hourglass: 'h-3.5 w-3.5', label: 'text-[11px]' },
  md: { number: 'text-sm font-bold', flame: 'h-4 w-4', hourglass: 'h-4 w-4', label: 'text-xs' },
  lg: { number: 'text-3xl font-black leading-none', flame: 'h-7 w-7', hourglass: 'h-5 w-5', label: 'text-xs' },
}

interface StreakBadgeProps {
  /** Attended-day streak, exactly as the RPC returned it. */
  streak: number
  /** The RPC's `streak_pending`. */
  pending: boolean
  size?: Size
  /**
   * Spell the pending message out next to the icon. Leave off where space is
   * tight (list rows): the icon then carries the same text as its accessible
   * name and tooltip.
   */
  showLabel?: boolean
  /** Text after the number, e.g. "day streak". */
  suffix?: string
  /** Replaces the bare number, e.g. "12-day streak" on the streak board. */
  valueText?: string
  /** Hide the flame where the surrounding card already draws one. */
  hideFlame?: boolean
  className?: string
}

export function StreakBadge({
  streak,
  pending,
  size = 'md',
  showLabel = false,
  suffix,
  valueText,
  hideFlame = false,
  className,
}: StreakBadgeProps) {
  const s = SIZES[size]
  const alive = streak > 0
  // A streak of 0 has nothing to keep, whatever the flag says.
  const showPending = pending && alive

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 ${className ?? ''}`}>
      <span className="inline-flex items-center gap-1">
        {!hideFlame && (
          <Flame
            aria-hidden="true"
            // 300-500 shades stay literal in both themes, so the flame keeps its colour in dark mode.
            className={`${s.flame} shrink-0 ${alive ? 'text-orange-500' : 'text-slate-300'}`}
          />
        )}
        <span className={`${s.number} tabular-nums text-slate-900`}>{valueText ?? formatCount(streak)}</span>
        {suffix && <span className="text-xs font-semibold text-slate-500">{suffix}</span>}
      </span>

      {showPending && (
        showLabel ? (
          <span className={`inline-flex items-center gap-1 font-semibold text-amber-700 ${s.label}`}>
            <Hourglass aria-hidden="true" className={`${s.hourglass} shrink-0 text-amber-500`} />
            {STREAK_PENDING_LABEL}
          </span>
        ) : (
          <span role="img" aria-label={STREAK_PENDING_LABEL} title={STREAK_PENDING_LABEL} className="inline-flex">
            <Hourglass aria-hidden="true" className={`${s.hourglass} shrink-0 text-amber-500`} />
          </span>
        )
      )}
    </span>
  )
}
