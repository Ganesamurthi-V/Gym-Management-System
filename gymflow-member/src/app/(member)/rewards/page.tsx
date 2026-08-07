import { Trophy, Star, Flame, Zap } from 'lucide-react'
import { getAttendancePageData } from '@/lib/member-data'
import { startPageTimer } from '@/lib/perf'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function RewardsPage() {
  const done = startPageTimer('rewards')

  // member + gym + attendance fetched in parallel (one round trip, not two)
  const data = await getAttendancePageData()
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load rewards.</p></div>
  }
  const { thisMonthCount, thisWeekCount, totalCount } = data.attendance

  done()

  // Simple milestone badges based on real attendance data
  const badges = [
    { id: 'first',    label: 'First Check-in',  desc: 'You showed up!',              earned: totalCount >= 1,   icon: Star,  colour: 'text-yellow-500', bg: 'bg-yellow-50' },
    { id: 'week',     label: 'Week Warrior',     desc: '5+ check-ins in a week',      earned: thisWeekCount >= 5, icon: Flame, colour: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'month10',  label: 'Month Hustler',    desc: '10 check-ins this month',     earned: thisMonthCount >= 10, icon: Zap,  colour: 'text-brand-600',  bg: 'bg-brand-50' },
    { id: 'total25',  label: 'Dedicated',        desc: '25 total check-ins',          earned: totalCount >= 25,  icon: Trophy, colour: 'text-violet-600', bg: 'bg-violet-50' },
    { id: 'total50',  label: 'Consistency King', desc: '50 total check-ins',          earned: totalCount >= 50,  icon: Trophy, colour: 'text-emerald-600',bg: 'bg-emerald-50' },
    { id: 'total100', label: 'Century Club',     desc: '100 total check-ins',         earned: totalCount >= 100, icon: Trophy, colour: 'text-rose-600',    bg: 'bg-rose-50' },
  ]

  const earned = badges.filter(b => b.earned)
  const locked = badges.filter(b => !b.earned)

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Rewards</h1>
      </header>

      {/* XP summary */}
      <div className="card mb-5 flex items-center gap-4 p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-50">
          <Trophy className="h-7 w-7 text-amber-500" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{earned.length} / {badges.length}</p>
          <p className="text-xs font-semibold text-slate-400">Badges earned</p>
        </div>
      </div>

      {/* Earned badges */}
      {earned.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Earned</h2>
          <div className="grid grid-cols-2 gap-3">
            {earned.map(({ id, label, desc, icon: Icon, colour, bg }) => (
              <div key={id} className="card flex flex-col items-center py-5 text-center">
                <span className={`mb-2 flex h-12 w-12 items-center justify-center rounded-2xl ${bg} ${colour}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <p className="text-xs font-bold text-slate-900">{label}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Locked badges */}
      {locked.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Locked</h2>
          <div className="grid grid-cols-2 gap-3">
            {locked.map(({ id, label, desc }) => (
              <div key={id} className="card flex flex-col items-center py-5 text-center opacity-40">
                <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                  <Trophy className="h-6 w-6 text-slate-400" />
                </span>
                <p className="text-xs font-bold text-slate-600">{label}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
