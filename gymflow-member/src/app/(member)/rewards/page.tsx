import { Trophy, Star, Flame, Zap, TrendingUp, Award } from 'lucide-react'
import { getMemberWithGym } from '@/lib/member-data'
import { getServerClient } from '@/lib/supabase/server'
import { startPageTimer } from '@/lib/perf'

export default async function RewardsPage() {
  const done = startPageTimer('rewards')

  const data = await getMemberWithGym()
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load rewards.</p></div>
  }
  const { member } = data

  // Call the gamification RPC — computes XP, badges, streak from real data.
  const supabase = await getServerClient()
  const { data: gamification } = await supabase.rpc('get_member_gamification', {
    p_member_id: member.id,
  })

  const g = (gamification ?? {}) as Record<string, number>
  const xp = g.xp ?? 0
  const streak = g.streak ?? 0
  const totalAttendance = g.total_attendance ?? 0
  const thisWeek = g.this_week ?? 0
  const thisMonth = g.this_month ?? 0
  const memberships = g.memberships ?? 0

  done()

  // Badge definitions — computed from the same thresholds as the DB function.
  const badges = [
    { id: 'first',    label: 'First Check-in',  desc: 'You showed up!',              earned: totalAttendance >= 1,   icon: Star,  colour: 'text-yellow-500', bg: 'bg-yellow-50' },
    { id: 'week',     label: 'Week Warrior',     desc: '5+ check-ins in a week',      earned: thisWeek >= 5,          icon: Flame, colour: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'month10',  label: 'Month Hustler',    desc: '10 check-ins this month',     earned: thisMonth >= 10,        icon: Zap,   colour: 'text-brand-600',  bg: 'bg-brand-50' },
    { id: 'total25',  label: 'Dedicated',        desc: '25 total check-ins',          earned: totalAttendance >= 25,  icon: Trophy, colour: 'text-violet-600', bg: 'bg-violet-50' },
    { id: 'total50',  label: 'Consistency King', desc: '50 total check-ins',          earned: totalAttendance >= 50,  icon: Trophy, colour: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'total100', label: 'Century Club',     desc: '100 total check-ins',         earned: totalAttendance >= 100, icon: Trophy, colour: 'text-rose-600',   bg: 'bg-rose-50' },
  ]

  const earned = badges.filter(b => b.earned)
  const locked = badges.filter(b => !b.earned)

  // XP level: every 100 XP is a level
  const level = Math.floor(xp / 100) + 1
  const xpInLevel = xp % 100

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Rewards</h1>
      </header>

      {/* XP + Level hero */}
      <div className="card mb-5 p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-200">
            <Trophy className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-black text-slate-900">{xp} XP</p>
            <p className="text-xs font-semibold text-slate-500">Level {level}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-brand-600">{earned.length}/{badges.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Badges</p>
          </div>
        </div>

        {/* Level progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Level {level} Progress</p>
            <p className="text-[10px] font-bold text-brand-600">{xpInLevel}/100 XP</p>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700"
              style={{ width: `${xpInLevel}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="card flex flex-col items-center py-4 text-center">
          <Flame className={`h-5 w-5 mb-1.5 ${streak > 0 ? 'text-orange-500' : 'text-slate-300'}`} />
          <p className="text-xl font-black text-slate-900">{streak}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Day Streak</p>
        </div>
        <div className="card flex flex-col items-center py-4 text-center">
          <TrendingUp className="h-5 w-5 mb-1.5 text-brand-500" />
          <p className="text-xl font-black text-slate-900">{totalAttendance}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Check-ins</p>
        </div>
        <div className="card flex flex-col items-center py-4 text-center">
          <Award className="h-5 w-5 mb-1.5 text-violet-500" />
          <p className="text-xl font-black text-slate-900">{memberships}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Renewals</p>
        </div>
      </div>

      {/* XP breakdown */}
      <div className="card mb-5 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">How You Earn XP</p>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Each check-in</span>
            <span className="font-bold text-brand-600">+10 XP</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Membership renewal</span>
            <span className="font-bold text-brand-600">+50 XP</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Portal activation</span>
            <span className="font-bold text-brand-600">+25 XP</span>
          </div>
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
