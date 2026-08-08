import { Trophy, Flame, TrendingUp, Award } from 'lucide-react'
import { getMemberWithGym, getMemberMemberships, getMemberAttendance } from '@/lib/member/member-data'
import { getServerClient } from '@/lib/supabase/server'
import { startPageTimer } from '@/lib/perf'
import { evaluateAchievements } from '@/lib/member/achievements/evaluator'
import { RARITY_ORDER } from '@/lib/member/achievements/types'
import type { Achievement, AchievementRarity, MemberStats } from '@/lib/member/achievements/types'
import AchievementCard from './AchievementCard'

export default async function RewardsPage() {
  const done = startPageTimer('rewards')

  const data = await getMemberWithGym()
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load rewards.</p></div>
  }
  const { member } = data

  // Fetch gamification stats + attendance in parallel
  const supabase = await getServerClient()
  const [{ data: gamification }, memberships, attendance] = await Promise.all([
    supabase.rpc('get_member_gamification', { p_member_id: member.id }),
    getMemberMemberships(),
    getMemberAttendance(),
  ])

  const g = (gamification ?? {}) as Record<string, number>
  const xp = g.xp ?? 0
  const streak = g.streak ?? 0
  const totalAttendance = g.total_attendance ?? 0
  const thisWeek = g.this_week ?? 0
  const thisMonth = g.this_month ?? 0
  const membershipCount = g.memberships ?? 0

  // Count early morning check-ins (session = 'morning' as proxy for before 7 AM)
  // The `session` field is set by the gym owner when marking attendance.
  const earlyMorningCheckins = attendance.records.filter(r => r.session === 'morning').length

  // Build MemberStats for the evaluator
  const stats: MemberStats = {
    totalCheckins: totalAttendance,
    currentStreak: streak,
    weeklyCheckins: thisWeek,
    monthlyCheckins: thisMonth,
    totalWorkouts: undefined, // No workout sessions table yet
    renewalCount: membershipCount,
    membershipStartDate: memberships.length > 0
      ? memberships[memberships.length - 1].start_date // oldest membership
      : member.created_at,
    totalXP: xp,
    earlyMorningCheckins,
    portalActivated: Boolean(member.portal_activated_at),
  }

  // Evaluate all achievements
  const allAchievements = evaluateAchievements(stats)
  const earned = allAchievements.filter(a => a.unlocked)
  const locked = allAchievements.filter(a => !a.unlocked)

  // XP level system (preserved from original)
  const level = Math.floor(xp / 100) + 1
  const xpInLevel = xp % 100

  done()

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Rewards</h1>
      </header>

      {/* XP + Level hero (preserved — do NOT modify per spec) */}
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
            <p className="text-lg font-black text-brand-600">{earned.length}/{allAchievements.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Achievements</p>
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

      {/* Stats row (preserved — do NOT modify per spec) */}
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
          <p className="text-xl font-black text-slate-900">{membershipCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Renewals</p>
        </div>
      </div>

      {/* XP breakdown (preserved — do NOT modify per spec) */}
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

      {/* ─── Achievements — rarity-grouped ─────────────────────────────────── */}

      {/* Earned section */}
      {earned.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Earned</h2>
          {groupByRarity(earned).map(([rarity, achievements]) => (
            <div key={rarity} className="mb-4">
              <RarityGroupHeader rarity={rarity} count={achievements.length} />
              <div className="grid grid-cols-2 gap-3">
                {achievements.map(a => (
                  <AchievementCard key={a.id} achievement={a} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="mb-6">
          <div className="card flex flex-col items-center py-10 text-center">
            <span className="mb-3 text-3xl">🎯</span>
            <p className="text-sm font-bold text-slate-700">Keep training!</p>
            <p className="mt-1 text-xs text-slate-400">Your first achievement is waiting.</p>
          </div>
        </section>
      )}

      {/* Locked section */}
      {locked.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Locked</h2>
          {groupByRarity(locked).map(([rarity, achievements]) => (
            <div key={rarity} className="mb-4">
              <RarityGroupHeader rarity={rarity} count={achievements.length} />
              <div className="grid grid-cols-2 gap-3">
                {achievements.map(a => (
                  <AchievementCard key={a.id} achievement={a} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Groups achievements by rarity in descending order (Mythic → Common) */
function groupByRarity(achievements: Achievement[]): [AchievementRarity, Achievement[]][] {
  const groups = new Map<AchievementRarity, Achievement[]>()

  for (const a of achievements) {
    const list = groups.get(a.rarity) ?? []
    list.push(a)
    groups.set(a.rarity, list)
  }

  // Return in RARITY_ORDER (mythic first)
  return RARITY_ORDER
    .filter(r => groups.has(r))
    .map(r => [r, groups.get(r)!])
}

const RARITY_LABEL_STYLES: Record<AchievementRarity, string> = {
  mythic: 'text-rarity-mythic',
  legendary: 'text-rarity-legendary',
  epic: 'text-rarity-epic',
  rare: 'text-rarity-rare',
  common: 'text-rarity-common',
}

function RarityGroupHeader({ rarity, count }: { rarity: AchievementRarity; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className={`text-[10px] font-black uppercase tracking-[0.12em] ${RARITY_LABEL_STYLES[rarity]}`}>
        {rarity}
      </span>
      <span className="text-[10px] font-bold text-slate-300">({count})</span>
    </div>
  )
}
