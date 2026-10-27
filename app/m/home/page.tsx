import Link from 'next/link'
import {
  Activity, BarChart3, Dumbbell, IndianRupee,
  AlertCircle, CheckCircle2, ChevronRight, Clock, Flame, Megaphone,
} from 'lucide-react'
import { getAssignedWorkoutPrograms, getMembershipPageData, getMemberGamification, recordMemberLogin } from '@/lib/member/member-data'
import { StreakBadge } from '@/components/member/StreakBadge'
import { WeeklyGoalRing } from '@/components/member/WeeklyGoalRing'
import { weeklyGoalProgress } from '@/lib/gamification/leaderboardDisplay'
import { formatDate, formatDateShort } from '@/lib/member/member-utils'
import { getMemberNotices } from '@/lib/member/notice-data'
import type { NoticeKind } from '@/types/notice'
import { startPageTimer } from '@/lib/perf'
import { formatCurrency, todayIST } from '@/lib/utils'
import { quoteForDate } from '@/lib/member/daily-quote'
import { workoutToday } from '@/lib/member/todays-workout'
import { greetingForHour, istHour } from '@/lib/member/greeting'

// No `revalidate` export: this page reads the auth cookie, which already makes
// it dynamic. A route-level `revalidate` cannot cache per-user responses in the
// shared Full Route Cache, so it would be a no-op here. Repeat navigations are
// served instantly from the client Router Cache instead — see
// `experimental.staleTimes` in next.config.mjs and the prefetching BottomNav.

// Left border carries the kind; the kind word stays visible because colour alone is not enough.
const NOTICE_STYLE: Record<NoticeKind, { border: string; label: string }> = {
  closure: { border: 'border-l-red-400', label: 'Closure' },
  holiday: { border: 'border-l-amber-400', label: 'Holiday' },
  batch: { border: 'border-l-emerald-400', label: 'New batch' },
  offer: { border: 'border-l-brand-400', label: 'Offer' },
  info: { border: 'border-l-slate-300', label: 'Info' },
}

export default async function HomePage() {
  const done = startPageTimer('home')

  // member + gym + memberships fetched in parallel (one round trip, not three).
  // The gamification RPC resolves the member from the session, so it joins the
  // same parallel batch instead of waiting for the member row.
  const [data, game, programs, notices] = await Promise.all([
    getMembershipPageData(),
    getMemberGamification(),
    getAssignedWorkoutPrograms(),
    getMemberNotices(),
  ])
  if (!data) {
    done()
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }
  const { member, gym, state } = data
  const { status, daysLeft, latest } = state

  // Stamp login. Runs via after() once the response is flushed, and is
  // throttled to once per 30 min, so it costs the page nothing.
  recordMemberLogin(member.id, member.gym_id, member.last_portal_login)

  done()

  const firstName = member.name.split(' ')[0]
  const goal = weeklyGoalProgress(game.daysLast7, game.weeklyGoalDays)
  const pendingAmount = member.pending_amount > 0 ? member.pending_amount : 0
  const workout = workoutToday(programs, todayIST())

  const statusConfig = {
    active:   { icon: CheckCircle2, text: `Active · ${daysLeft} days left`,   colour: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    expiring: { icon: AlertCircle,  text: `Expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, colour: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
    expired:  { icon: AlertCircle,  text: 'Membership expired',               colour: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
    none:     { icon: Clock,        text: 'No active membership',              colour: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200' },
  }
  const cfg = statusConfig[status]
  const StatusIcon = cfg.icon

  const quickActions = [
    { label: 'Attendance', icon: Activity,    href: '/m/attendance' },
    { label: 'Progress',   icon: BarChart3,   href: '/m/progress' },
  ]

  return (
    <div className="page-container py-6">

      {/* Greeting */}
      <header className="mb-5">
        <p className="text-sm font-medium text-slate-500">{greetingForHour(istHour())}</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Hi {firstName} 👋</h1>
        <p className="mt-0.5 text-xs text-slate-400">{gym.name}</p>
      </header>

      {/* Daily quote: one line per day (IST), the same for everyone, a different one tomorrow. Kept quiet. */}
      <blockquote className="mb-5 border-l-2 border-brand-300 pl-3 text-sm leading-snug text-slate-600">
        {quoteForDate(todayIST())}
      </blockquote>

      {/* Gym notices: server-rendered, only when the gym has posted any that are live. */}
      {notices.length > 0 && (
        <section aria-label="Notices" className="mb-5 space-y-3">
          {notices.map(n => (
            <article key={n.id} className={`card rounded-2xl border-l-4 p-4 ${NOTICE_STYLE[n.kind].border}`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Megaphone aria-hidden="true" className="h-3.5 w-3.5" />
                {NOTICE_STYLE[n.kind].label}
              </p>
              <h2 className="mt-1 text-sm font-bold text-slate-900">{n.title}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{n.body}</p>
              <p className="mt-2 text-xs text-slate-400">Posted {formatDateShort(n.createdAt)} by {gym.name}</p>
            </article>
          ))}
        </section>
      )}

      {/* Pending dues: only when the member owes something. A notice, not a link: payment is made at the gym. */}
      {pendingAmount > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <IndianRupee aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm text-slate-600">
            <span className="font-bold text-amber-600">{formatCurrency(pendingAmount)} pending.</span>{' '}
            Pay it here or at the gym front desk.
          </p>
          <Link
            href="/m/membership/pay-due"
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-amber-300 bg-amber-100 px-4 text-sm font-bold text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Pay now
          </Link>
        </div>
      )}

      {/* Today's workout, from the programs the gym assigned (day = IST weekday). The page's one filled card:
          it is the thing a member opens the app to do. */}
      {workout.kind === 'workout' && (
        <Link
          href="/m/workout"
          className="mb-5 block rounded-2xl bg-brand-500 p-5 text-white shadow-sm transition-all active:scale-[0.98]"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
            <Dumbbell aria-hidden="true" className="h-3.5 w-3.5" />
            Today&apos;s workout
          </p>
          <p className="mt-2 text-xl font-bold leading-tight">{workout.workout.programName}</p>
          <p className="mt-1 text-sm leading-snug text-white/85">
            {workout.workout.exerciseCount} exercise{workout.workout.exerciseCount === 1 ? '' : 's'}
            {workout.workout.exerciseNames.length > 0 && <> · {workout.workout.exerciseNames.join(', ')}</>}
          </p>
          <span className="mt-4 inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-white px-4 text-sm font-bold text-brand-500">
            Start workout
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </span>
        </Link>
      )}
      {workout.kind === 'rest' && (
        <Link href="/m/workout" className="card mb-5 flex items-center gap-3 rounded-2xl p-4 transition-all active:scale-[0.98]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Dumbbell aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">Rest day</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {workout.nextDay ? `Your next workout is on ${workout.nextDay}.` : 'No exercises are scheduled yet.'}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
        </Link>
      )}

      {/* Streak and weekly goal: one card, two numbers. Neutral, so the page keeps one loud element. */}
      <section aria-label="Your streak and weekly goal" className="card mb-5 grid grid-cols-2 divide-x divide-slate-100 rounded-2xl">
        <div className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Flame aria-hidden="true" className="h-3.5 w-3.5 text-orange-500" />
            Streak
          </p>
          {/* The number is attended days only; the hourglass (inside StreakBadge)
              is the whole "today is still open" message. */}
          <StreakBadge
            streak={game.streak}
            pending={game.streakPending}
            size="lg"
            suffix={game.streak === 1 ? 'day' : 'days'}
            hideFlame
            showLabel
            className="mt-2"
          />
          {!game.streakPending && (
            <p className={`mt-2 text-xs font-medium ${game.attendedToday ? 'text-emerald-600' : 'text-slate-500'}`}>
              {game.attendedToday ? 'Checked in today' : 'Check in to start a streak'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 p-4">
          <WeeklyGoalRing days={game.daysLast7} goal={game.weeklyGoalDays} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Weekly goal</p>
            <p className={`mt-1 text-xs font-bold leading-snug ${goal.reached ? 'text-emerald-600' : 'text-slate-700'}`}>
              {goal.reached
                ? 'Goal reached'
                : `${goal.target - goal.done} more ${goal.target - goal.done === 1 ? 'day' : 'days'} to go`}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Last 7 days</p>
          </div>
        </div>
      </section>

      {/* Membership status. Colour carries the meaning here: green is fine, amber and red need action. */}
      <Link
        href="/m/membership"
        className={`mb-6 flex items-center gap-3 rounded-2xl border p-4 transition-all active:scale-[0.98] ${cfg.bg} ${cfg.border}`}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface/70 ${cfg.colour}`}>
          <StatusIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${cfg.colour}`}>{cfg.text}</p>
          {latest && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {latest.plan.charAt(0).toUpperCase() + latest.plan.slice(1)} plan
              &nbsp;·&nbsp;expires {formatDate(latest.end_date)}
            </p>
          )}
        </div>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      </Link>
      {status !== 'active' && (
        <Link
          href="/m/membership/renew"
          className="-mt-3 mb-6 flex min-h-[44px] items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white transition-all active:scale-[0.98]"
        >
          Renew
        </Link>
      )}

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="mb-3 text-sm font-semibold text-slate-700">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map(({ label, icon: Icon, href }) => (
            <Link
              key={href}
              href={href}
              className="card tap-target flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.96]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-700">{label}</span>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
