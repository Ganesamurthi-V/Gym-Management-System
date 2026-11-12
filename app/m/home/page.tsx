import Link from 'next/link'
import {
  Activity, Scale, Dumbbell, IndianRupee,
  AlertCircle, CheckCircle2, ChevronRight, Clock, Flame,
} from 'lucide-react'
import { getAssignedWorkoutPrograms, getMembershipPageData, getMemberGamification, recordMemberLogin } from '@/lib/member/member-data'
import { StreakBadge } from '@/components/member/StreakBadge'
import { WeeklyGoalRing } from '@/components/member/WeeklyGoalRing'
import { weeklyGoalProgress } from '@/lib/gamification/leaderboardDisplay'
import { formatDate } from '@/lib/member/member-utils'
import { getMemberNotifications } from '@/lib/member/notifications'
import { NotificationBell } from '@/components/member/NotificationBell'
import { startPageTimer } from '@/lib/perf'
import { formatCurrency, todayIST } from '@/lib/utils'
import { quoteForDate } from '@/lib/member/daily-quote'
import { cookies } from 'next/headers'
import { workoutToday, programsForHome, MY_PROGRAM_COOKIE } from '@/lib/member/todays-workout'
import { greetingForHour, istHour } from '@/lib/member/greeting'
import { PushReminderBanner } from '@/components/member/PushReminderBanner'
import { Stagger, StaggerItem, Pressable } from '@/components/ui/motion'
import { isPushConfigured, vapidPublicKey } from '@/lib/push/config'

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
  const [data, game, programs, notifications] = await Promise.all([
    getMembershipPageData(),
    getMemberGamification(),
    getAssignedWorkoutPrograms(),
    getMemberNotifications(),
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

  const pushKey = isPushConfigured() ? vapidPublicKey() : null
  const firstName = member.name.split(' ')[0]
  const goal = weeklyGoalProgress(game.daysLast7, game.weeklyGoalDays)
  const pendingAmount = member.pending_amount > 0 ? member.pending_amount : 0
  const chosenProgramId = (await cookies()).get(MY_PROGRAM_COOKIE)?.value
  const workout = workoutToday(programsForHome(programs, chosenProgramId), todayIST())

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
    { label: 'Body progress', icon: Scale,    href: '/m/progress/body' },
  ]

  return (
    <div className="page-container py-6">
      <Stagger>

      {/* Greeting */}
      <StaggerItem>
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">{greetingForHour(istHour())}</p>
            <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-slate-900">Hi {firstName}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{gym.name}</p>
          </div>
          <NotificationBell latestAt={notifications.items[0]?.at ?? null} />
        </header>
      </StaggerItem>

      {/* No week strip: the gamification RPC returns only the last-7-days count, not which days. */}

      {/* Daily quote: one line per day (IST), the same for everyone, a different one tomorrow. Kept quiet. */}
      <StaggerItem>
        <blockquote className="mb-5 border-l-2 border-brand-300 pl-3 text-sm leading-snug text-slate-600">
          {quoteForDate(todayIST())}
        </blockquote>
      </StaggerItem>

      {pushKey && <StaggerItem><PushReminderBanner publicKey={pushKey} /></StaggerItem>}

      {/* Pending dues: only when the member owes something. */}
      {pendingAmount > 0 && (
        <StaggerItem>
          <div className="mb-5 flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <IndianRupee aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="min-w-0 flex-1 text-sm text-slate-600">
              <span className="font-bold text-amber-600">{formatCurrency(pendingAmount)} pending.</span>{' '}
              Pay it here or at the gym front desk.
            </p>
            <Link
              href="/m/membership/pay-due"
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-amber-300 bg-amber-100 px-5 text-sm font-bold text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Pay now
            </Link>
          </div>
        </StaggerItem>
      )}

      {/* Today's workout, from the programs the gym assigned (day = IST weekday). The page's one filled card:
          it is the thing a member opens the app to do. */}
      {workout.kind === 'workout' && (
        <StaggerItem>
          <Pressable className="mb-5">
            <Link
              href={`/m/workout?program=${workout.workout.programId}`}
              className="block rounded-3xl bg-brand-500 p-6 text-white shadow-sm"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                <Dumbbell aria-hidden="true" className="h-3.5 w-3.5" />
                Today&apos;s workout
              </p>
              <p className="mt-2 text-2xl font-bold leading-tight tracking-tight">{workout.workout.programName}</p>
              <p className="mt-1 text-sm leading-snug text-white/85">
                {workout.workout.exerciseCount} exercise{workout.workout.exerciseCount === 1 ? '' : 's'}
                {workout.workout.exerciseNames.length > 0 && <> · {workout.workout.exerciseNames.join(', ')}</>}
              </p>
              <span className="mt-5 inline-flex min-h-[48px] items-center gap-1 rounded-full bg-white px-6 text-sm font-bold text-brand-500">
                Start workout
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </span>
            </Link>
          </Pressable>
        </StaggerItem>
      )}
      {workout.kind === 'rest' && (
        <StaggerItem>
          <Pressable className="mb-5">
            <Link href="/m/workout" className="tile flex items-center gap-3 p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Dumbbell aria-hidden="true" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold tracking-tight text-slate-900">Rest day</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {workout.nextDay ? `Your next workout is on ${workout.nextDay}.` : 'No exercises are scheduled yet.'}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          </Pressable>
        </StaggerItem>
      )}

      {/* Streak and weekly goal: two neutral tiles, so the page keeps one loud element. */}
      <StaggerItem>
        <section aria-label="Your streak and weekly goal" className="mb-5 grid grid-cols-2 gap-3">
          <div className="tile p-4">
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
              className="mt-3"
            />
            {!game.streakPending && (
              <p className={`mt-2 text-xs font-medium ${game.attendedToday ? 'text-emerald-600' : 'text-slate-500'}`}>
                {game.attendedToday ? 'Checked in today' : 'Check in to start a streak'}
              </p>
            )}
          </div>

          <div className="tile flex flex-col items-start gap-2 p-4">
            <p className="text-xs font-semibold text-slate-500">Weekly goal</p>
            <WeeklyGoalRing days={game.daysLast7} goal={game.weeklyGoalDays} />
            <div className="min-w-0">
              <p className={`text-xs font-bold leading-snug ${goal.reached ? 'text-emerald-600' : 'text-slate-700'}`}>
                {goal.reached
                  ? 'Goal reached'
                  : `${goal.target - goal.done} more ${goal.target - goal.done === 1 ? 'day' : 'days'} to go`}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Last 7 days</p>
            </div>
          </div>
        </section>
      </StaggerItem>

      {/* Membership status. Colour carries the meaning here: green is fine, amber and red need action. */}
      <StaggerItem>
        <Pressable className={status !== 'active' ? 'mb-3' : 'mb-6'}>
          <Link
            href="/m/membership"
            className={`flex items-center gap-3 rounded-3xl border p-4 ${cfg.bg} ${cfg.border}`}
          >
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface/70 ${cfg.colour}`}>
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
        </Pressable>
        {status !== 'active' && (
          <Pressable className="mb-6">
            <Link
              href="/m/membership/renew"
              className="flex min-h-[48px] items-center justify-center rounded-full bg-brand-500 px-5 text-sm font-bold text-white"
            >
              Renew
            </Link>
          </Pressable>
        )}
      </StaggerItem>

      {/* Quick actions */}
      <StaggerItem>
        <section aria-labelledby="quick-actions-title">
          <h2 id="quick-actions-title" className="mb-3 text-sm font-semibold text-slate-700">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map(({ label, icon: Icon, href }) => (
              <Pressable key={href}>
                <Link href={href} className="tile tap-target flex flex-col items-start gap-3 p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{label}</span>
                </Link>
              </Pressable>
            ))}
          </div>
        </section>
      </StaggerItem>

      </Stagger>
    </div>
  )
}
