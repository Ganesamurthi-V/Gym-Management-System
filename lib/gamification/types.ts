/**
 * Gamification types. camelCase mirrors of the SQL shapes; the snake_case wire
 * shapes live next to their mappers (settings.ts, mapLeaderboard.ts,
 * mapMemberGamification.ts).
 */

export type LeaderboardBoard = 'week' | 'month' | 'streak' | 'all'

/** A calendar date as 'YYYY-MM-DD' (always an Asia/Kolkata date here). */
export type DateString = string

export interface XpMultiplier {
  label: string
  /** 1..5, at most 2 decimals. */
  factor: number
  /** 0 = Sunday .. 6 = Saturday. null = every day. */
  daysOfWeek: number[] | null
  /** Inclusive. null = no lower bound. */
  startDate: DateString | null
  /** Inclusive. null = no upper bound. */
  endDate: DateString | null
}

export interface GamificationSettings {
  leaderboardsEnabled: boolean
  xpPerCheckin: number
  xpPerRenewal: number
  xpPortalActivation: number
  weeklyGoalDays: number
  xpMultipliers: XpMultiplier[]
  /** Threshold overrides keyed by achievement code. */
  badgeRules: Record<string, number>
  weeklyPrize: string | null
  monthlyPrize: string | null
}

/** One row of `get_gym_leaderboard`, camelCased. */
export interface LeaderboardRow {
  /** null for other people's rows when the caller is a member. */
  memberId: string | null
  /** Full name for owners, "First L." for members. */
  displayName: string
  rank: number
  /** The board's ranking value: days (week/month), streak days, or XP (all). */
  value: number
  xp: number
  streak: number
  /** Streak is alive but today's check-in is not recorded yet. */
  streakPending: boolean
  daysLast7: number
  daysLast30: number
  isMe: boolean
  /** Number of members on this board for this caller. */
  totalMembers: number
  /** Lifetime attended days. */
  totalDays: number
}

/** `get_member_gamification()`, camelCased. */
export interface MemberGamification {
  xp: number
  xpPerLevel: number
  streak: number
  streakPending: boolean
  longestStreak: number
  totalDays: number
  daysLast7: number
  daysLast30: number
  attendedToday: boolean
  weeklyGoalDays: number
  memberships: number
  portalActivated: boolean
  leaderboardsEnabled: boolean
  showOnLeaderboard: boolean
  /** Morning-session check-ins (rows, not days). */
  totalMorning: number
  badgeRules: Record<string, number>
  weeklyPrize: string | null
  monthlyPrize: string | null
}

/** The two attendance columns the day/streak rules need. */
export interface AttendanceStamp {
  /** attendance.date, 'YYYY-MM-DD'. */
  date: DateString
  /** attendance.created_at: when the row was saved. */
  createdAt: string | Date | null
}

export interface StreakResult {
  streak: number
  streakPending: boolean
  longestStreak: number
  /** Most recent attended day that is not in the future, or null. */
  lastAttendedDay: DateString | null
  attendedToday: boolean
}
