import { weeklyGoalProgress } from '@/lib/gamification/leaderboardDisplay'
import { ProgressRing } from '@/components/ui/motion'
import { CountUp } from '@/components/ui/motion'

/**
 * Progress ring for the weekly goal: attended days in the last 7 days against
 * the gym's target (`weekly_goal_days`).
 *
 * The window is rolling (it has no Monday reset), so the caption beside it must
 * say "last 7 days" and not "this week".
 */
export function WeeklyGoalRing({ days, goal }: { days: number; goal: number }) {
  const { done, target, fraction, reached } = weeklyGoalProgress(days, goal)

  return (
    <ProgressRing
      value={fraction}
      size={72}
      strokeWidth={8}
      label={`${done} of ${target} days in the last 7 days`}
      // 500 shades are literal in both themes, so the arc keeps its colour in dark mode.
      className={reached ? 'text-emerald-500' : 'text-brand-500'}
    >
      <span aria-hidden="true" className="text-base font-bold tabular-nums tracking-tight text-slate-900">
        <CountUp value={done} />/{target}
      </span>
    </ProgressRing>
  )
}
