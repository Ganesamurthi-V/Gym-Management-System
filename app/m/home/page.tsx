import Link from 'next/link'
import {
  IndianRupee, AlertCircle, CheckCircle2, ChevronRight, Clock, Dumbbell, Flame, Trophy,
} from 'lucide-react'
import { getAssignedWorkoutPrograms, getMemberAttendance, getMembershipPageData, getMemberGamification, recordMemberLogin } from '@/lib/member/member-data'
import { StreakBadge } from '@/components/member/StreakBadge'
import { MemberTopBar } from '@/components/member/MemberTopBar'
import { weeklyGoalProgress } from '@/lib/gamification/leaderboardDisplay'
import { levelFromXp } from '@/lib/gamification/xp'
import { formatDate } from '@/lib/member/member-utils'
import { getMemberNotifications } from '@/lib/member/notifications'
import { NotificationBell } from '@/components/member/NotificationBell'
import { startPageTimer } from '@/lib/perf'
import { cn, formatCurrency, todayIST } from '@/lib/utils'
import { quoteForDate } from '@/lib/member/daily-quote'
import { cookies } from 'next/headers'
import { upcomingWorkouts, weekdayOf, programsForHome, MY_PROGRAM_COOKIE } from '@/lib/member/todays-workout'
import { greetingForHour, istHour } from '@/lib/member/greeting'
import { PushReminderBanner } from '@/components/member/PushReminderBanner'
import { Stagger, StaggerItem, Pressable, CountUp, WeekStrip } from '@/components/ui/motion'
import { isPushConfigured, vapidPublicKey } from '@/lib/push/config'

// No `revalidate` export: this page reads the auth cookie, which already makes
// it dynamic. A route-level `revalidate` cannot cache per-user responses in the
// shared Full Route Cache, so it would be a no-op here. Repeat navigations are
// served instantly from the client Router Cache instead — see
// `experimental.staleTimes` in next.config.mjs and the prefetching BottomNav.

const DAY_MS = 86_400_000

/** The 7 IST calendar days ending today. Date-only strings, so UTC arithmetic is exact (never the server's local day). */
function lastSevenDays(today: string, attended: ReadonlySet<string>) {
  return Array.from({ length: 7 }, (_, i) => {
    const key = new Date(Date.parse(`${today}T00:00:00Z`) - (6 - i) * DAY_MS).toISOString().slice(0, 10)
    const isToday = key === today
    const state: 'done' | 'today' | 'missed' = attended.has(key) ? 'done' : isToday ? 'today' : 'missed'
    return { key, weekday: weekdayOf(key), day: String(Number(key.slice(8))), state }
  })
}

export default async function HomePage() {
  const done = startPageTimer('home')

  // member + gym + memberships fetched in parallel (one round trip, not three).
  // The gamification RPC resolves the member from the session, so it joins the
  // same parallel batch instead of waiting for the member row.
  const [data, game, programs, notifications, attendance] = await Promise.all([
    getMembershipPageData(),
    getMemberGamification(),
    getAssignedWorkoutPrograms(),
    getMemberNotifications(),
    getMemberAttendance(),
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
  const remaining = goal.target - goal.done
  const pendingAmount = member.pending_amount > 0 ? member.pending_amount : 0
  const chosenProgramId = (await cookies()).get(MY_PROGRAM_COOKIE)?.value
  const today = todayIST()
  const homePrograms = programsForHome(programs, chosenProgramId)
  const upcoming = upcomingWorkouts(homePrograms, today, 4)
  const todaysCard = upcoming[0]?.isToday ? upcoming[0] : null
  const laterCards = todaysCard ? upcoming.slice(1) : upcoming
  const weekDays = lastSevenDays(today, attendance.checkedInDates)
  const level = levelFromXp(game.xp, game.xpPerLevel)

  const statusConfig = {
    active:   { icon: CheckCircle2, text: `Active · ${daysLeft} days left`,   colour: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    expiring: { icon: AlertCircle,  text: `Expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, colour: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
    expired:  { icon: AlertCircle,  text: 'Membership expired',               colour: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
    none:     { icon: Clock,        text: 'No active membership',              colour: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200' },
  }
  const cfg = statusConfig[status]
  const StatusIcon = cfg.icon

  return (
    <>
      <MemberTopBar
        variant="root"
        title={gym.name}
        memberName={member.name}
        actions={<NotificationBell latestAt={notifications.items[0]?.at ?? null} />}
      />

      <div className="page-container pb-6 pt-2">
        <Stagger>

          {/* Headline: the weekly goal is the one question this screen answers first. */}
          <StaggerItem>
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-500">{greetingForHour(istHour())}, {firstName}</p>
              <p className={cn('mt-1 text-3xl font-bold leading-tight tracking-tight', goal.reached ? 'text-emerald-600' : 'text-slate-900')}>
                {goal.reached
                  ? 'Goal reached this week'
                  : `${remaining} more ${remaining === 1 ? 'day' : 'days'} to go this week`}
              </p>
            </div>
          </StaggerItem>

          {pushKey && <StaggerItem><PushReminderBanner publicKey={pushKey} /></StaggerItem>}

          {/* Last 7 IST days; tapping opens the full calendar. */}
          <StaggerItem>
            <Link
              href="/m/attendance"
              aria-label="Open attendance calendar"
              className="tile mb-6 block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <WeekStrip days={weekDays} />
            </Link>
          </StaggerItem>

          {/* Next training: today's workout is the page's one filled card. */}
          {upcoming.length > 0 || homePrograms.length > 0 ? (
            <StaggerItem>
              <section aria-labelledby="next-training-title" className="mb-6">
                <h2 id="next-training-title" className="mb-3 text-sm font-semibold text-slate-700">Next training</h2>
                <div className="rail">
                  {todaysCard ? (
                    <Link
                      href={`/m/workout?program=${todaysCard.programId}`}
                      className="block w-[85%] max-w-[22rem] rounded-3xl bg-brand-500 p-5 text-white shadow-sm"
                    >
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                        <Dumbbell aria-hidden="true" className="h-3.5 w-3.5" />
                        Today
                      </p>
                      <p className="mt-2 text-2xl font-bold leading-tight tracking-tight">{todaysCard.programName}</p>
                      <p className="mt-1 text-sm leading-snug text-white/85">
                        {todaysCard.exerciseCount} exercise{todaysCard.exerciseCount === 1 ? '' : 's'}
                        {todaysCard.exerciseNames.length > 0 && <> · {todaysCard.exerciseNames.join(', ')}</>}
                      </p>
                      <span className="mt-5 inline-flex min-h-[48px] items-center gap-1 rounded-full bg-white px-6 text-sm font-bold text-brand-500">
                        Start workout
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </span>
                    </Link>
                  ) : (
                    <Link href="/m/workout" className="tile flex w-[78%] max-w-[20rem] flex-col justify-between p-5">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Dumbbell aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <span className="mt-3 block">
                        <span className="block text-base font-bold tracking-tight text-slate-900">Rest day</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {laterCards[0] ? `Your next workout is on ${laterCards[0].weekday}.` : 'No exercises are scheduled yet.'}
                        </span>
                      </span>
                    </Link>
                  )}
                  {laterCards.map((w) => (
                    <Link
                      key={w.date}
                      href={`/m/workout?program=${w.programId}`}
                      className="tile flex min-h-[44px] w-40 flex-col p-4"
                    >
                      <span className="text-xs font-semibold text-slate-500">{w.weekday}</span>
                      <span className="mt-1 line-clamp-2 text-base font-bold leading-snug tracking-tight text-slate-900">{w.programName}</span>
                      <span className="mt-auto pt-3 text-xs text-slate-500">
                        {w.exerciseCount} exercise{w.exerciseCount === 1 ? '' : 's'}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            </StaggerItem>
          ) : null}

          {/* This week: streak, check-ins and level in one tile. */}
          <StaggerItem>
            <section aria-labelledby="this-week-title" className="mb-6">
              <h2 id="this-week-title" className="mb-3 text-sm font-semibold text-slate-700">This week</h2>
              <div className="tile grid grid-cols-3 divide-x divide-surface-border">
                <div className="min-w-0 p-4">
                  <p className="flex items-center gap-1 text-xs font-semibold text-slate-500">
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
                </div>
                <div className="min-w-0 p-4">
                  <p className="text-xs font-semibold text-slate-500">Check-ins</p>
                  <p className="mt-2 text-4xl font-bold leading-none tracking-tight text-slate-900 tabular-nums">
                    <CountUp value={game.daysLast7} />
                  </p>
                  <p className="mt-1 text-xs text-slate-500">of {goal.target}</p>
                </div>
                <Link href="/m/rewards" className="block min-w-0 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500">
                  <p className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <Trophy aria-hidden="true" className="h-3.5 w-3.5 text-amber-500" />
                    Level
                  </p>
                  <p className="mt-2 text-4xl font-bold leading-none tracking-tight text-slate-900 tabular-nums">{level.level}</p>
                  <p className="mt-1 text-xs text-slate-500">Rewards</p>
                </Link>
              </div>
            </section>
          </StaggerItem>

          {/* Pending dues: only when the member owes something. */}
          {pendingAmount > 0 && (
            <StaggerItem>
              <div className="mb-3 flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
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

          {/* Membership status. Colour carries the meaning here: green is fine, amber and red need action. */}
          <StaggerItem>
            {status === 'active' ? (
              <Pressable className="mb-6">
                <Link href="/m/membership" className={`flex min-h-[44px] items-center gap-3 rounded-full border px-4 py-2.5 ${cfg.bg} ${cfg.border}`}>
                  <StatusIcon aria-hidden="true" className={`h-5 w-5 shrink-0 ${cfg.colour}`} />
                  <p className={`min-w-0 flex-1 truncate text-sm font-bold ${cfg.colour}`}>{cfg.text}</p>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </Pressable>
            ) : (
              <div className="mb-6">
                <Pressable className="mb-3">
                  <Link
                    href="/m/membership"
                    className={`flex items-center gap-3 rounded-3xl border p-4 ${cfg.bg} ${cfg.border}`}
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface/70 ${cfg.colour}`}>
                      <StatusIcon aria-hidden="true" className="h-5 w-5" />
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
                <Pressable>
                  <Link
                    href="/m/membership/renew"
                    className="flex min-h-[48px] items-center justify-center rounded-full bg-brand-500 px-5 text-sm font-bold text-white"
                  >
                    Renew
                  </Link>
                </Pressable>
              </div>
            )}
          </StaggerItem>

          {/* Daily quote: one line per day (IST), the same for everyone, a different one tomorrow. Kept quiet. */}
          <StaggerItem>
            <blockquote className="border-l-2 border-brand-300 pl-3 text-xs leading-snug text-slate-500">
              {quoteForDate(today)}
            </blockquote>
          </StaggerItem>

        </Stagger>
      </div>
    </>
  )
}
