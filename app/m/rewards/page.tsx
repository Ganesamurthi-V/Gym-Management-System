import { getMemberWithGym, getMemberMemberships, getMemberAttendance } from '@/lib/member/member-data'
import { getServerClient } from '@/lib/supabase/server'
import { startPageTimer } from '@/lib/perf'
import { evaluateAchievements } from '@/lib/member/achievements/evaluator'
import { RARITY_ORDER } from '@/lib/member/achievements/types'
import type { Achievement, AchievementRarity, MemberStats } from '@/lib/member/achievements/types'
import RewardsClient from './RewardsClient'

export default async function RewardsPage() {
  const done = startPageTimer('rewards')

  const data = await getMemberWithGym()
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load rewards.</p></div>
  }
  const { member } = data

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

  const earlyMorningCheckins = attendance.records.filter(r => r.session === 'morning').length

  const stats: MemberStats = {
    totalCheckins: totalAttendance,
    currentStreak: streak,
    weeklyCheckins: thisWeek,
    monthlyCheckins: thisMonth,
    totalWorkouts: undefined,
    renewalCount: membershipCount,
    membershipStartDate: memberships.length > 0
      ? memberships[memberships.length - 1].start_date
      : member.created_at,
    totalXP: xp,
    earlyMorningCheckins,
    portalActivated: Boolean(member.portal_activated_at),
  }

  const allAchievements = evaluateAchievements(stats)
  const earned = allAchievements.filter(a => a.unlocked)
  const locked = allAchievements.filter(a => !a.unlocked)

  // Level: 1 level per 300 XP
  const level = Math.floor(xp / 300) + 1
  const xpInLevel = xp % 300
  const xpForNextLevel = 300

  // Level titles
  const levelTitle = getLevelTitle(level)

  done()

  return (
    <RewardsClient
      xp={xp}
      level={level}
      levelTitle={levelTitle}
      xpInLevel={xpInLevel}
      xpForNextLevel={xpForNextLevel}
      totalAchievements={allAchievements.length}
      earnedCount={earned.length}
      earned={earned}
      locked={locked}
      allAchievements={allAchievements}
    />
  )
}

function getLevelTitle(level: number): string {
  if (level >= 20) return 'Legend'
  if (level >= 15) return 'Champion'
  if (level >= 10) return 'Elite Member'
  if (level >= 7) return 'Dedicated'
  if (level >= 5) return 'Regular'
  if (level >= 3) return 'Active'
  return 'Beginner'
}
