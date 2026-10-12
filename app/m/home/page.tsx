import Link from 'next/link'
import {
  Activity, CreditCard, Dumbbell, QrCode,
  AlertCircle, CheckCircle2, Clock, Flame,
} from 'lucide-react'
import { getMembershipPageData, getMemberGamification, recordMemberLogin } from '@/lib/member/member-data'
import { StreakBadge } from '@/components/member/StreakBadge'
import { WeeklyGoalRing } from '@/components/member/WeeklyGoalRing'
import { LeaderboardEntryCard } from '@/components/member/LeaderboardEntryCard'
import { weeklyGoalProgress } from '@/lib/gamification/leaderboardDisplay'
import { formatDate } from '@/lib/member/member-utils'
import { startPageTimer } from '@/lib/perf'

// No `revalidate` export: this page reads the auth cookie, which already makes
// it dynamic. A route-level `revalidate` cannot cache per-user responses in the
// shared Full Route Cache, so it would be a no-op here. Repeat navigations are
// served instantly from the client Router Cache instead — see
// `experimental.staleTimes` in next.config.mjs and the prefetching BottomNav.

export default async function HomePage() {
  const done = startPageTimer('home')

  // member + gym + memberships fetched in parallel (one round trip, not three).
  // The gamification RPC resolves the member from the session, so it joins the
  // same parallel batch instead of waiting for the member row.
  const [data, game] = await Promise.all([
    getMembershipPageData(),
    getMemberGamification(),
  ])
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load your profile. Please try logging out and back in.</p></div>
  }
  const { member, gym, state } = data
  const { status, daysLeft, latest } = state

  // Stamp login. Runs via after() once the response is flushed, and is
  // throttled to once per 30 min, so it costs the page nothing.
  recordMemberLogin(member.id, member.gym_id, member.last_portal_login)

  done()

  const firstName = member.name.split(' ')[0]
  const goal = weeklyGoalProgress(game.daysLast7, game.weeklyGoalDays)

  const statusConfig = {
    active:   { icon: CheckCircle2, text: `Active · ${daysLeft} days left`,   colour: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    expiring: { icon: AlertCircle,  text: `Expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, colour: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
    expired:  { icon: AlertCircle,  text: 'Membership expired',               colour: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
    none:     { icon: Clock,        text: 'No active membership',              colour: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200' },
  }
  const cfg = statusConfig[status]
  const StatusIcon = cfg.icon

  const quickActions = [
    { label: 'Membership', icon: CreditCard,  href: '/m/membership' },
    { label: 'Attendance', icon: Activity,    href: '/m/attendance' },
    { label: 'Workout',    icon: Dumbbell,    href: '/m/workout' },
    { label: 'My Card',    icon: QrCode,      href: '/m/membership/card' },
  ]

  return (
    <div className="page-container py-6">

      {/* Greeting */}
      <header className="mb-5">
        <p className="text-sm font-medium text-slate-500">Welcome back,</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">{firstName} 👋</h1>
        <p className="mt-1 text-xs text-slate-400">{gym.name}</p>
      </header>

      {/* Membership status banner */}
      <Link
        href="/m/membership"
        className={`mb-5 flex items-center gap-3 rounded-2xl border p-4 transition-all active:scale-[0.98] ${cfg.bg} ${cfg.border}`}
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
        <span className="text-slate-300">›</span>
      </Link>

      {/* Streak + weekly goal */}
      <section aria-label="Your streak and weekly goal" className="mb-5 grid grid-cols-2 gap-3">
        <div className="card rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Flame aria-hidden="true" className={`h-3.5 w-3.5 ${game.streak > 0 ? 'text-orange-500' : 'text-slate-300'}`} />
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
            <p className={`mt-2 text-xs font-semibold ${game.attendedToday ? 'text-emerald-600' : 'text-slate-500'}`}>
              {game.attendedToday ? 'Checked in today' : 'Check in to start a streak'}
            </p>
          )}
        </div>

        <div className="card flex items-center gap-3 rounded-2xl p-4">
          <WeeklyGoalRing days={game.daysLast7} goal={game.weeklyGoalDays} />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Weekly goal</p>
            <p className={`mt-1 text-xs font-bold leading-snug ${goal.reached ? 'text-emerald-600' : 'text-slate-700'}`}>
              {goal.reached
                ? 'Goal reached'
                : `${goal.target - goal.done} more ${goal.target - goal.done === 1 ? 'day' : 'days'} to go`}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Last 7 days</p>
          </div>
        </div>
      </section>

      {game.leaderboardsEnabled && <LeaderboardEntryCard className="mb-5" />}

      {/* Hero card */}
      <section className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-lg shadow-brand-200">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-100">{gym.name}</p>
        <h2 className="mt-2 text-xl font-bold">Your fitness journey</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-brand-100">
          Track your attendance, view your membership, and access your digital card — all in one place.
        </p>
      </section>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="mb-3 text-sm font-semibold text-slate-700">Quick actions</h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map(({ label, icon: Icon, href }) => (
            <Link
              key={href}
              href={href}
              className="card tap-target flex flex-col items-center justify-center gap-1.5 py-4 text-center transition-all active:scale-[0.96]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold text-slate-600 leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
