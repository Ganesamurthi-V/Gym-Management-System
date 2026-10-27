import Link from 'next/link'
import { BarChart3, CalendarCheck, TrendingUp, Award, Flame, Zap, ChevronRight } from 'lucide-react'
import { getBodyLogs, getRecentSessions } from '@/lib/member/progress-data'
import { fmtNum, shortDate, istDateOf } from '@/lib/progress/chart'
import { getProgressPageData, getMemberGamification } from '@/lib/member/member-data'
import { StreakBadge } from '@/components/member/StreakBadge'
import { formatCount } from '@/lib/gamification/leaderboardDisplay'
import { levelFromXp } from '@/lib/gamification/xp'
import { startPageTimer } from '@/lib/perf'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function ProgressPage() {
  const done = startPageTimer('progress')

  // member + gym + memberships + attendance all in parallel (one round trip).
  // Previously the member query had to resolve first to supply member.id.
  // The gamification RPC needs no member id either, so it rides in the same batch.
  const [data, game, bodyLogs, sessions] = await Promise.all([
    getProgressPageData(), getMemberGamification(), getBodyLogs(), getRecentSessions(),
  ])
  if (!data) {
    done()
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }
  const { memberships, attendance } = data

  done()

  const { level } = levelFromXp(game.xp, game.xpPerLevel)

  // Newest first: latest weight is the first with a weight, the first entry the last.
  const weighed = bodyLogs.filter((l) => l.weightKg != null)
  let bodySummary = 'Log your first weight'
  if (weighed.length > 0) {
    const newest = weighed[0]
    const oldest = weighed[weighed.length - 1]
    bodySummary = `${fmtNum(newest.weightKg as number)} kg`
    if (weighed.length > 1) {
      const diff = Math.round(((newest.weightKg as number) - (oldest.weightKg as number)) * 10) / 10
      const dir = diff === 0 ? 'no change' : `${diff < 0 ? 'down' : 'up'} ${fmtNum(Math.abs(diff))} kg`
      bodySummary += `, ${dir} since ${shortDate(oldest.loggedOn)}`
    }
  }
  const workoutSummary = sessions.length === 0
    ? 'Your finished workouts appear here'
    : `${sessions.length} recent ${sessions.length === 1 ? 'workout' : 'workouts'}, latest ${shortDate(istDateOf(sessions[0].startedAt))}`

  const stats = [
    { label: 'Total check-ins',  value: attendance.totalCount,    icon: CalendarCheck, colour: 'text-brand-600',   bg: 'bg-brand-50' },
    { label: 'This month',       value: attendance.thisMonthCount, icon: TrendingUp,    colour: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'This week',        value: attendance.thisWeekCount,  icon: BarChart3,     colour: 'text-orange-500',  bg: 'bg-orange-50' },
    { label: 'Memberships',      value: memberships.length,        icon: Award,         colour: 'text-violet-600',  bg: 'bg-violet-50' },
  ]

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">My Progress</h1>
      </header>

      {/* Stats grid */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon, colour, bg }) => (
          <div key={label} className="card p-4">
            <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${bg} ${colour}`}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Streak + XP. Same two tiles as the grid above, kept separate because the
          streak is not a plain number: it carries the pending state. */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="card p-4">
          <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <Flame aria-hidden="true" className="h-4 w-4" />
          </span>
          <StreakBadge streak={game.streak} pending={game.streakPending} size="lg" hideFlame />
          <p className="mt-0.5 text-xs font-semibold text-slate-400">Day streak · best {formatCount(game.longestStreak)}</p>
        </div>
        <div className="card p-4">
          <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Zap aria-hidden="true" className="h-4 w-4" />
          </span>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{formatCount(game.xp)}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-400">Total XP · level {level}</p>
        </div>
      </div>

      <div className="space-y-3">
        <Link href="/m/progress/body" className="card flex min-h-[44px] items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900">Body progress</p>
            <p className="mt-0.5 text-xs text-slate-500">{bodySummary}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </Link>
        <Link href="/m/progress/workouts" className="card flex min-h-[44px] items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900">Workout history</p>
            <p className="mt-0.5 text-xs text-slate-500">{workoutSummary}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </Link>
      </div>

    </div>
  )
}
