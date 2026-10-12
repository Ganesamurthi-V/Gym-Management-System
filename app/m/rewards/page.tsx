import {
  getMemberWithGym,
  getMemberMemberships,
  getMemberAttendance,
  getMemberGamification,
} from '@/lib/member/member-data'
import { getServerClient } from '@/lib/supabase/server'
import { startPageTimer, timed } from '@/lib/perf'
import { evaluateAchievements } from '@/lib/member/achievements/evaluator'
import {
  mapRecordedAchievements,
  mergeRecordedAchievements,
  unlockedCodes,
  type RecordedAchievement,
} from '@/lib/member/achievements/merge'
import type { Achievement, MemberStats } from '@/lib/member/achievements/types'
import { levelFromXp } from '@/lib/gamification/xp'
import RewardsClient from './RewardsClient'

/**
 * Makes the currently-met achievements permanent and returns everything the
 * member has ever earned (with dates, and `isNew` for rows inserted just now).
 *
 * Runs on every Rewards load rather than at check-in time because achievements
 * are evaluated here, from several sources; the RPC is idempotent (unique
 * member + code), so repeating it only costs the round trip.
 *
 * Never throws: a failure here (network, or the 20261012 migration not run
 * yet) must leave the page showing the live evaluation, not an error.
 */
async function recordAchievements(codes: string[]): Promise<RecordedAchievement[]> {
  try {
    const supabase = await getServerClient()
    // Called even with no codes: it also returns badges earned earlier that
    // are no longer met, which is exactly what must stay unlocked.
    const { data, error } = await timed('record achievements (rpc)', () =>
      supabase.rpc('record_member_achievements', { p_codes: codes }),
    )
    if (error) {
      console.error('[rewards] record_member_achievements failed', { code: error.code, message: error.message })
      return []
    }
    return mapRecordedAchievements(data)
  } catch (err) {
    console.error('[rewards] record_member_achievements threw', err)
    return []
  }
}

export default async function RewardsPage() {
  const done = startPageTimer('rewards')

  // All four are independent, so this is one round trip. The gamification RPC
  // takes no argument and resolves the member from auth.uid(); it used to take
  // a member id and trust it, which leaked across gyms.
  const [data, game, memberships, attendance] = await Promise.all([
    getMemberWithGym(),
    getMemberGamification(),
    getMemberMemberships(),
    getMemberAttendance(),
  ])
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load rewards.</p></div>
  }
  const { member } = data

  const stats: MemberStats = {
    // Attended DAYS, not rows: a morning and an evening session are one day.
    totalCheckins: game.totalDays,
    currentStreak: game.streak,
    // Rolling windows (last 7 / last 30 days), same numbers as the leaderboard.
    weeklyCheckins: game.daysLast7,
    monthlyCheckins: game.daysLast30,
    totalWorkouts: undefined,
    renewalCount: game.memberships,
    membershipStartDate: memberships.length > 0
      ? memberships[memberships.length - 1].start_date
      : member.created_at,
    totalXP: game.xp,
    // Lifetime count from the RPC. The attendance query only covers the last
    // six months, so it is the fallback only when the RPC returned nothing.
    earlyMorningCheckins: game.totalMorning > 0
      ? game.totalMorning
      : attendance.records.filter(r => r.session === 'morning').length,
    portalActivated: game.portalActivated || Boolean(member.portal_activated_at),
  }

  // 1. What is met right now, with the gym's threshold overrides applied.
  const evaluated = evaluateAchievements(stats, game.badgeRules)
  // 2. Record it, and read back every unlock the member has ever earned. This
  //    is a second, sequential round trip (it depends on step 1); it is what
  //    stops a streak badge re-locking the day after a missed check-in.
  const recorded = await recordAchievements(unlockedCodes(evaluated))
  // 3. Recorded unlocks win over the live evaluation.
  const allAchievements: Achievement[] = mergeRecordedAchievements(evaluated, recorded)

  const earned = allAchievements.filter(a => a.unlocked)
  const locked = allAchievements.filter(a => !a.unlocked)

  const { level, xpInLevel, xpForNextLevel } = levelFromXp(game.xp, game.xpPerLevel)
  const levelTitle = getLevelTitle(level)

  done()

  return (
    <RewardsClient
      xp={game.xp}
      level={level}
      levelTitle={levelTitle}
      xpInLevel={xpInLevel}
      xpForNextLevel={xpForNextLevel}
      totalAchievements={allAchievements.length}
      earnedCount={earned.length}
      earned={earned}
      locked={locked}
      allAchievements={allAchievements}
      streak={game.streak}
      streakPending={game.streakPending}
      longestStreak={game.longestStreak}
      leaderboardsEnabled={game.leaderboardsEnabled}
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
