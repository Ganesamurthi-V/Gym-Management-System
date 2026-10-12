import { weeklyGoalProgress } from '@/lib/gamification/leaderboardDisplay'

/**
 * Progress ring for the weekly goal: attended days in the last 7 days against
 * the gym's target (`weekly_goal_days`).
 *
 * The window is rolling (it has no Monday reset), so the caption beside it must
 * say "last 7 days" and not "this week".
 *
 * Plain SVG: no chart library for one circle, and it renders on the server.
 */

const SIZE = 64
const STROKE = 7
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function WeeklyGoalRing({ days, goal }: { days: number; goal: number }) {
  const { done, target, fraction, reached } = weeklyGoalProgress(days, goal)

  return (
    <div
      role="img"
      aria-label={`${done} of ${target} days in the last 7 days`}
      className="relative h-16 w-16 shrink-0"
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-16 w-16 -rotate-90" aria-hidden="true">
        {/* Track: a neutral tint, which the theme inverts on its own. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          stroke="currentColor"
          className="text-slate-100"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          // 500 shades are literal in both themes, so the arc keeps its colour in dark mode.
          className={reached ? 'text-emerald-500' : 'text-brand-500'}
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums text-slate-900"
      >
        {done}/{target}
      </span>
    </div>
  )
}
