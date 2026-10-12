/**
 * lib/whatsapp/gamificationNudges.ts
 *
 * Pure selection logic for the scheduled gamification WhatsApp nudges. No IO: the daily job
 * (runGamificationNudges in ./automation.ts) loads one gym's members, attendance and recent
 * log rows, and this module decides who gets which message. Kept pure so every rule below
 * is unit-tested without a database (__tests__/whatsapp/gamificationNudges.test.ts).
 *
 * The job runs once a day in the morning (the existing 09:00 IST cron), so the three
 * nudges are written for a member who has not been to the gym yet today:
 *
 *   gym_streak_at_risk       a streak of MIN_STREAK_FOR_NUDGE+ days that still needs today's
 *                            check-in. At most once per streak-day.
 *   gym_weekly_goal_reached  attended days in the last 7 days reached the gym's weekly goal,
 *                            and the member was in yesterday or today. Once per ISO week.
 *   gym_leaderboard_rank_up  the member is alone at #1 on the gym's last-7-days board.
 *                            At most once per RANK_UP_COOLDOWN_DAYS days.
 *
 * A member gets AT MOST ONE of these per day. When more than one applies the first in
 * NUDGE_PRIORITY wins: the streak message is the only one that is useless tomorrow.
 *
 * Streaks and attended days come from lib/gamification (the same rules the member app and
 * the leaderboard use), so a number in a message always matches the number on screen.
 */

import { computeStreak, attendedDays } from '@/lib/gamification/streak'
import { addDays, countDaysInWindow, diffDays, istDateOf, istToday, rollingWindow } from '@/lib/gamification/periods'
import { BOARD_WINDOW_DAYS } from '@/lib/gamification/constants'
import type { AttendanceStamp, DateString } from '@/lib/gamification/types'
import type { GamificationTemplateId } from '@/types/whatsapp'

// ─── Rules ──────────────────────────────────────────────────────────────────

/** The scheduled nudges, highest priority first. gym_prize_awarded is an event send, not here. */
export const NUDGE_PRIORITY = [
  'gym_streak_at_risk',
  'gym_weekly_goal_reached',
  'gym_leaderboard_rank_up',
] as const satisfies readonly GamificationTemplateId[]

export type NudgeTemplateId = (typeof NUDGE_PRIORITY)[number]

/** A 1- or 2-day streak is not worth a message; from 3 days there is something to lose. */
export const MIN_STREAK_FOR_NUDGE = 3

/** A member who stays #1 is told once, then not again for this many days. */
export const RANK_UP_COOLDOWN_DAYS = 7

/** {{3}} of gym_leaderboard_rank_up. Lower case: it sits mid-sentence ("on the last 7 days leaderboard"). */
export const RANK_UP_BOARD_NAME = 'last 7 days'

/** "#1 of 1" is not a lead. The board needs at least this many ranked members. */
export const MIN_BOARD_SIZE_FOR_RANK_UP = 2

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface NudgeMember {
  id: string
  name: string
  phone: string | null
  /** members.show_on_leaderboard: the member's own choice. Opted-out members are not ranked. */
  showOnLeaderboard: boolean
  /** The member's attendance rows. Must reach back to the start of their current streak. */
  attendance: readonly AttendanceStamp[]
}

/** One whatsapp_automation_logs row that counts as "a message went out" (status sent or failed). */
export interface NudgeLogRow {
  memberId: string
  templateName: string
  cycleKey: string
  /** ISO timestamp. */
  sentAt: string
}

export interface SelectNudgesInput {
  members: readonly NudgeMember[]
  /** gym_gamification_settings.weekly_goal_days (already normalised). */
  weeklyGoalDays: number
  /** Which nudge templates may be sent at all (the enable-list). */
  isEnabled: (template: NudgeTemplateId) => boolean
  /** Recent gamification log rows for this gym: at least the last RANK_UP_COOLDOWN_DAYS + 1 days. */
  history: readonly NudgeLogRow[]
  now?: Date | string | number
}

export interface SelectedNudge {
  memberId: string
  memberName: string
  phone: string
  template: NudgeTemplateId
  /** Idempotency key stored on the log + queue row. */
  cycleKey: string
  /** The day this nudge is about (YYYY-MM-DD). */
  triggerDate: DateString
  /** Template variables, merged into the TemplateContext by the caller. */
  context: {
    streakDays?: number
    daysAttended?: number
    rank?: number
    boardName?: string
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Same test the rest of the automation uses: at least 10 digits. */
export function hasSendablePhone(phone: string | null | undefined): phone is string {
  return !!phone && phone.replace(/\D/g, '').length >= 10
}

/** ISO-8601 week of a date, e.g. "2026-W42". Weeks start on Monday; week 1 holds 4 January. */
export function isoWeekLabel(date: DateString): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${date}`)
  // The ISO week-year is the year of that week's Thursday.
  const dayOfWeek = d.getUTCDay() || 7 // Monday = 1 .. Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const nudgeCycleKeys = {
  /** One per streak-day: the last attended day identifies "this streak, still waiting for the next check-in". */
  streakAtRisk: (memberId: string, lastAttendedDay: DateString) => `gym_streak_at_risk:${memberId}:${lastAttendedDay}`,
  weeklyGoal: (memberId: string, isoWeek: string) => `gym_weekly_goal_reached:${memberId}:${isoWeek}`,
  rankUp: (memberId: string, today: DateString) => `gym_leaderboard_rank_up:${memberId}:${today}`,
}

interface MemberHistory {
  /** Any gamification nudge already went out (or is claimed) today. */
  nudgedToday: boolean
  cycleKeys: Set<string>
  /** IST day of the most recent rank-up message, or null. */
  lastRankUpDay: DateString | null
}

function indexHistory(history: readonly NudgeLogRow[], now: Date): Map<string, MemberHistory> {
  const today = istToday(now)
  // The claim index (one 'sent' row per member + template + day) works on the UTC day, so a
  // row counts as "today" on either calendar: no second message on the same IST day, and no
  // claim attempt that the index would reject anyway.
  const utcToday = now.toISOString().slice(0, 10)
  const nudgeTemplates: readonly string[] = NUDGE_PRIORITY
  const byMember = new Map<string, MemberHistory>()

  for (const row of history) {
    if (!nudgeTemplates.includes(row.templateName)) continue
    const sentAt = new Date(row.sentAt)
    if (Number.isNaN(sentAt.getTime())) continue

    let entry = byMember.get(row.memberId)
    if (!entry) {
      entry = { nudgedToday: false, cycleKeys: new Set(), lastRankUpDay: null }
      byMember.set(row.memberId, entry)
    }

    const sentDay = istDateOf(sentAt)
    if (sentDay === today || sentAt.toISOString().slice(0, 10) === utcToday) entry.nudgedToday = true
    entry.cycleKeys.add(row.cycleKey)
    if (row.templateName === 'gym_leaderboard_rank_up' && (!entry.lastRankUpDay || sentDay > entry.lastRankUpDay)) {
      entry.lastRankUpDay = sentDay
    }
  }
  return byMember
}

/**
 * The member who is alone at the top of the last-7-days board, or null.
 *
 * Mirrors what members see (get_gym_leaderboard, board 'week'): only members who chose to
 * appear, only those with at least one attended day. A tie on days is broken by name on
 * screen; here a tie means nobody "took the lead", so nobody is messaged.
 */
export function soleWeeklyLeader(entries: ReadonlyArray<{ id: string; days: number; visible: boolean }>): string | null {
  const ranked = entries.filter(e => e.visible && e.days > 0).sort((a, b) => b.days - a.days)
  if (ranked.length < MIN_BOARD_SIZE_FOR_RANK_UP) return null
  return ranked[0].days > ranked[1].days ? ranked[0].id : null
}

// ─── Selection ──────────────────────────────────────────────────────────────

/**
 * Decide today's nudges for one gym: at most one per member, highest priority first.
 * Deterministic for the same inputs, which is what makes a double-fired cron safe: both
 * runs pick the same template for a member, and the claim index lets only one through.
 */
export function selectNudges(input: SelectNudgesInput): SelectedNudge[] {
  const now = input.now == null ? new Date() : new Date(input.now)
  const enabled = NUDGE_PRIORITY.filter(t => input.isEnabled(t))
  if (enabled.length === 0) return []

  const today = istToday(now)
  const yesterday = addDays(today, -1)
  const week = rollingWindow(BOARD_WINDOW_DAYS.week, now)
  const isoWeek = isoWeekLabel(today)
  const history = indexHistory(input.history, now)
  const goal = Math.max(1, Math.floor(input.weeklyGoalDays))

  const computed = input.members.map(member => {
    const days = attendedDays(member.attendance)
    return {
      member,
      streak: computeStreak(member.attendance, now),
      daysLast7: countDaysInWindow(days, week),
    }
  })

  const leaderId = enabled.includes('gym_leaderboard_rank_up')
    ? soleWeeklyLeader(computed.map(c => ({ id: c.member.id, days: c.daysLast7, visible: c.member.showOnLeaderboard })))
    : null

  const selected: SelectedNudge[] = []

  for (const { member, streak, daysLast7 } of computed) {
    if (!hasSendablePhone(member.phone)) continue
    const past = history.get(member.id)
    if (past?.nudgedToday) continue // one gamification message per member per day

    const base = { memberId: member.id, memberName: member.name, phone: member.phone }

    for (const template of enabled) {
      if (template === 'gym_streak_at_risk') {
        if (streak.streak < MIN_STREAK_FOR_NUDGE || !streak.streakPending || !streak.lastAttendedDay) continue
        const cycleKey = nudgeCycleKeys.streakAtRisk(member.id, streak.lastAttendedDay)
        if (past?.cycleKeys.has(cycleKey)) continue
        selected.push({ ...base, template, cycleKey, triggerDate: today, context: { streakDays: streak.streak } })
        break
      }

      if (template === 'gym_weekly_goal_reached') {
        if (daysLast7 < goal) continue
        // Only the morning after a visit (or later the same day): the message should follow
        // the check-in that earned it, not arrive days after the member stopped coming.
        if (!streak.lastAttendedDay || streak.lastAttendedDay < yesterday) continue
        const cycleKey = nudgeCycleKeys.weeklyGoal(member.id, isoWeek)
        if (past?.cycleKeys.has(cycleKey)) continue
        selected.push({ ...base, template, cycleKey, triggerDate: today, context: { daysAttended: daysLast7 } })
        break
      }

      if (template === 'gym_leaderboard_rank_up') {
        if (member.id !== leaderId) continue
        if (past?.lastRankUpDay && diffDays(past.lastRankUpDay, today) < RANK_UP_COOLDOWN_DAYS) continue
        selected.push({
          ...base,
          template,
          cycleKey: nudgeCycleKeys.rankUp(member.id, today),
          triggerDate: today,
          context: { rank: 1, boardName: RANK_UP_BOARD_NAME },
        })
        break
      }
    }
  }

  return selected
}
