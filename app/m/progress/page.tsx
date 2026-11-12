import Link from 'next/link'
import { Scale, Activity, Ruler, CircleDot, Flame, ChevronRight } from 'lucide-react'
import { getBodyLogs, getBodyProfile } from '@/lib/member/progress-data'
import { buildReport, type MetricKey, type Tone } from '@/lib/progress/report'
import { fmtNum, shortDate } from '@/lib/progress/chart'
import { getProgressPageData, getMemberGamification } from '@/lib/member/member-data'
import { StreakBadge } from '@/components/member/StreakBadge'
import { formatCount } from '@/lib/gamification/leaderboardDisplay'
import { WeightChart } from '@/components/member/WeightChart'
import { startPageTimer } from '@/lib/perf'
import { CountUp, FadeIn, Pressable, Stagger, StaggerItem } from '@/components/ui/motion'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function ProgressPage() {
  const done = startPageTimer('progress')

  // member + gym + memberships + attendance all in parallel (one round trip).
  // Previously the member query had to resolve first to supply member.id.
  // The gamification RPC needs no member id either, so it rides in the same batch.
  const [data, game, bodyLogs, profile] = await Promise.all([
    getProgressPageData(), getMemberGamification(), getBodyLogs(), getBodyProfile(),
  ])
  if (!data) {
    done()
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }

  done()

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

  // Body metrics replace the attendance counts here; attendance lives on the home and attendance pages.
  const report = buildReport(bodyLogs, profile)
  const tiles: { key: MetricKey; label: string; icon: typeof Scale; colour: string; bg: string }[] = [
    { key: 'weight', label: 'Weight', icon: Scale,     colour: 'text-brand-600',   bg: 'bg-brand-50' },
    { key: 'bmi',    label: 'BMI',    icon: Activity,  colour: 'text-emerald-600', bg: 'bg-emerald-50' },
    { key: 'waist',  label: 'Waist',  icon: Ruler,     colour: 'text-orange-500',  bg: 'bg-orange-50' },
    { key: 'hips',   label: 'Hips',   icon: CircleDot, colour: 'text-violet-600',  bg: 'bg-violet-50' },
  ]
  const toneClass: Record<Tone, string> = { good: 'text-emerald-600', bad: 'text-amber-600', neutral: 'text-slate-400' }
  const stats = tiles.map((t) => {
    const row = report.rows.find((r) => r.key === t.key)
    const latest = row?.latest ?? null
    const unit = row?.unit ?? ''
    let note = 'Not logged yet'
    if (row?.latest != null) {
      note = row.change == null || row.change === 0
        ? 'Latest'
        : `${row.change < 0 ? 'Down' : 'Up'} ${fmtNum(Math.abs(row.change))}${row.unit === '' ? '' : ` ${row.unit}`} since start`
    }
    return { ...t, latest, unit, note, tone: row?.tone ?? 'neutral' }
  })

  return (
    <div className="page-container py-6">

      <FadeIn>
        <header className="mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
          <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-slate-900">My Progress</h1>
        </header>
      </FadeIn>

      {/* Hero: the weight trend. Level/XP lives on Rewards. */}
      <FadeIn delay={40}>
        <section className="tile mb-3 p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">Weight trend</p>
              <p className="mt-1 text-3xl font-black leading-none tracking-tight text-slate-900">{bodySummary.split(',')[0]}</p>
            </div>
            <Link href="/m/progress/body" className="inline-flex min-h-[44px] items-center rounded-full bg-surface-secondary px-4 text-xs font-bold text-slate-700">
              Log weight
            </Link>
          </div>
          <WeightChart logs={bodyLogs} />
        </section>
      </FadeIn>

      {/* Streak + body stats. The streak is not a plain number: it carries the pending state. */}
      <Stagger className="mb-5 grid grid-cols-2 gap-3">
        <StaggerItem className="tile p-4">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500">
            <Flame aria-hidden="true" className="h-4 w-4" />
          </span>
          <StreakBadge streak={game.streak} pending={game.streakPending} size="lg" hideFlame />
          <p className="mt-1 text-xs font-semibold text-slate-500">Day streak · best {formatCount(game.longestStreak)}</p>
        </StaggerItem>
        {stats.map(({ label, latest, unit, note, tone, icon: Icon, colour, bg }) => (
          <StaggerItem key={label} className="tile p-4">
            <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${bg} ${colour}`}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-3xl font-black leading-none tracking-tight text-slate-900">
              {latest != null
                ? <><CountUp value={latest} decimals={Number.isInteger(Math.round(latest * 10) / 10) ? 0 : 1} />{unit !== '' && <span className="ml-1 text-sm font-bold text-slate-500">{unit}</span>}</>
                : '-'}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
            <p className={`mt-1 text-xs font-semibold ${toneClass[tone]}`}>{note}</p>
          </StaggerItem>
        ))}
      </Stagger>

      <Stagger className="space-y-3">
        {[
          { href: '/m/progress/body', title: 'Body progress', sub: bodySummary },
        ].map((l) => (
          <StaggerItem key={l.href}>
            <Pressable>
              <Link href={l.href} className="tile flex min-h-[44px] items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-900">{l.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{l.sub}</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
                  <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
                </span>
              </Link>
            </Pressable>
          </StaggerItem>
        ))}
      </Stagger>

    </div>
  )
}
