/**
 * Plain-language copy for owner-defined events, shared by the owner console
 * and the member app so both always describe an event in the same words.
 *
 * Pure: every function that depends on "today" takes it as an IST date string,
 * so tests do not depend on the clock and the server and browser agree.
 */

import { diffDays } from './periods'
import type { EventGoalType, EventSessionFilter } from './events'
import type { DateString } from './types'

export type EventStatus = 'upcoming' | 'running' | 'ended' | 'paused'

interface GoalLike {
  goalType: EventGoalType
  goalTarget: number
  minSessionMinutes: number | null
  sessionFilter: EventSessionFilter | null
}

interface RewardLike {
  rewardXp: number
  rewardText: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** "20 Oct". The year is added only when it differs from `today`'s, to keep cards short. */
export function formatEventDate(date: DateString, today?: DateString): string {
  const [y, m, d] = date.split('-').map(Number)
  const base = `${d} ${MONTHS[m - 1]}`
  return today && Number(today.slice(0, 4)) !== y ? `${base} ${y}` : base
}

/** 60 -> "1 hour", 90 -> "1.5 hours", 120 -> "2 hours", 45 -> "45 minutes", 100 -> "1 hour 40 minutes". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return plural(minutes, 'minute')
  if (minutes % 30 === 0) {
    const hours = minutes / 60
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  const h = Math.floor(minutes / 60)
  return `${plural(h, 'hour')} ${plural(minutes - h * 60, 'minute')}`
}

/** The whole goal, e.g. "Stay 2 hours or more on 3 days (morning only)". */
export function goalSentence(goal: GoalLike): string {
  const n = goal.goalTarget
  if (goal.goalType === 'streak_days') return `Keep a ${n}-day streak`
  const days = plural(n, 'day')
  const filter = goal.sessionFilter ? ` (${goal.sessionFilter} only)` : ''
  if (goal.goalType === 'long_sessions') {
    return `Stay ${formatDuration(goal.minSessionMinutes ?? 0)} or more on ${days}${filter}`
  }
  return `Check in on ${days}${filter}`
}

/** "200 XP", "Protein shaker", or "200 XP and Protein shaker". Empty when there is no reward. */
export function rewardSentence(reward: RewardLike): string {
  const parts: string[] = []
  if (reward.rewardXp > 0) parts.push(`${reward.rewardXp.toLocaleString('en-IN')} XP`)
  if (reward.rewardText) parts.push(reward.rewardText)
  return parts.join(' and ')
}

/** "20 Oct to 5 Nov". */
export function dateRangeText(start: DateString, end: DateString, today?: DateString): string {
  return `${formatEventDate(start, today)} to ${formatEventDate(end, today)}`
}

/**
 * Upcoming / Running / Ended by IST date (both ends inclusive). An ended event
 * stays "Ended" even if paused: pausing it changes nothing any more.
 */
export function eventStatus(
  event: { startDate: DateString; endDate: DateString; isActive: boolean },
  today: DateString,
): EventStatus {
  if (today > event.endDate) return 'ended'
  if (!event.isActive) return 'paused'
  return today < event.startDate ? 'upcoming' : 'running'
}

/** The one-sentence live preview shown while the owner fills the form. */
export function previewSentence(
  event: GoalLike & RewardLike & { startDate: DateString; endDate: DateString },
  today?: DateString,
): string {
  const goal = goalSentence(event)
  const clause = goal.charAt(0).toLowerCase() + goal.slice(1)
  const reward = rewardSentence(event) || 'no reward yet'
  const from = formatEventDate(event.startDate, today)
  const to = formatEventDate(event.endDate, today)
  return `Members who ${clause} between ${from} and ${to} get ${reward}.`
}

/** Member-facing timing: "Starts on 20 Oct", "Ends today", "1 day left", "5 days left". */
export function daysLeftText(
  event: { startDate: DateString; endDate: DateString },
  today: DateString,
): string {
  if (today < event.startDate) return `Starts on ${formatEventDate(event.startDate, today)}`
  const left = diffDays(today, event.endDate)
  if (left < 0) return 'Ended'
  if (left === 0) return 'Ends today'
  return `${plural(left, 'day')} left`
}
