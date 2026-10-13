/**
 * Owner-defined gamification events (challenges with a goal and a reward).
 *
 * Pure, and an exact mirror of the SQL in supabase-schema.sql
 * (`gym_event_progress`, the CHECK constraints on `gym_events`). Change both
 * together.
 *
 * PROGRESS (all dates are Asia/Kolkata dates)
 *  - checkin_days   distinct attended days in [start, min(end, today)]
 *  - streak_days    longest run of consecutive attended days inside that window
 *  - long_sessions  distinct days with at least one session whose check-out is
 *                   set and (checkOut - createdAt) >= minSessionMinutes
 * "Attended day" is the SAME definition as streak.ts (`effectiveDay`: 5-hour
 * rollover grace, resolved against ALL of the member's raw rows). The optional
 * session filter is applied AFTER the effective day is resolved, and never to
 * streak_days. Completed when progress >= goalTarget.
 */

import { z } from 'zod'
import { EVENT_GOAL_TYPES, EVENT_LIMITS, EVENT_SESSION_FILTERS } from './constants'
import { addDays, diffDays, isValidDateString, istToday } from './periods'
import { effectiveDay } from './streak'
import type { DateString } from './types'

export type EventGoalType = (typeof EVENT_GOAL_TYPES)[number]
export type EventSessionFilter = (typeof EVENT_SESSION_FILTERS)[number]

/** A gym_events row, camelCased. */
export interface GymEvent {
  id: string
  title: string
  description: string | null
  goalType: EventGoalType
  goalTarget: number
  minSessionMinutes: number | null
  sessionFilter: EventSessionFilter | null
  startDate: DateString
  endDate: DateString
  rewardXp: number
  rewardText: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** The fields the progress rules read. */
export type EventRule = Pick<
  GymEvent,
  'goalType' | 'goalTarget' | 'minSessionMinutes' | 'sessionFilter' | 'startDate' | 'endDate'
>

/** One attendance row, as far as events care. */
export interface EventAttendanceRow {
  /** attendance.date */
  date: DateString
  /** attendance.created_at */
  createdAt: string | Date | null
  session: EventSessionFilter | null
  /** attendance.check_out_time */
  checkOutTime: string | Date | null
}

/** `get_member_events()` element. The RPC already emits camelCase keys. */
export interface MemberEvent {
  id: string
  title: string
  description: string | null
  goalType: EventGoalType
  goalTarget: number
  minSessionMinutes: number | null
  sessionFilter: EventSessionFilter | null
  startDate: DateString
  endDate: DateString
  rewardXp: number
  rewardText: string | null
  progress: number
  completed: boolean
  completedAt: string | null
  rewardGiven: boolean
}

// ── Validation ────────────────────────────────────────────────────────────────

const dateField = z
  .string()
  .refine(isValidDateString, { message: 'Use a real date as YYYY-MM-DD' })

/** Trims; an empty string becomes null so "clear the field" is expressible. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(v => (v == null || v === '' ? null : v))

const eventFieldsShape = {
  title: z.string().trim().min(1, 'Title is required').max(EVENT_LIMITS.titleMax),
  description: optionalText(EVENT_LIMITS.descriptionMax),
  goalType: z.enum(EVENT_GOAL_TYPES),
  goalTarget: z
    .number()
    .int()
    .min(EVENT_LIMITS.goalTarget.min)
    .max(EVENT_LIMITS.goalTarget.max),
  minSessionMinutes: z
    .number()
    .int()
    .min(EVENT_LIMITS.minSessionMinutes.min)
    .max(EVENT_LIMITS.minSessionMinutes.max)
    .nullish()
    .transform(v => v ?? null),
  sessionFilter: z
    .enum(EVENT_SESSION_FILTERS)
    .nullish()
    .transform(v => v ?? null),
  startDate: dateField,
  endDate: dateField,
  rewardXp: z
    .number()
    .int()
    .min(EVENT_LIMITS.rewardXp.min)
    .max(EVENT_LIMITS.rewardXp.max)
    .default(0),
  rewardText: optionalText(EVENT_LIMITS.rewardTextMax),
  isActive: z.boolean().default(true),
}

type CrossFieldInput = {
  goalType?: EventGoalType
  minSessionMinutes?: number | null
  sessionFilter?: EventSessionFilter | null
  startDate?: DateString
  endDate?: DateString
  rewardXp?: number
  rewardText?: string | null
}

/** The cross-field rules, identical to the CHECK constraints on gym_events. */
function crossFieldChecks(v: CrossFieldInput, ctx: z.RefinementCtx): void {
  if (v.goalType === 'long_sessions' && v.minSessionMinutes == null) {
    ctx.addIssue({
      code: 'custom',
      path: ['minSessionMinutes'],
      message: 'Minimum session length is required for long-session events',
    })
  }
  if (v.goalType != null && v.goalType !== 'long_sessions' && v.minSessionMinutes != null) {
    ctx.addIssue({
      code: 'custom',
      path: ['minSessionMinutes'],
      message: 'Minimum session length only applies to long-session events',
    })
  }
  if (v.goalType === 'streak_days' && v.sessionFilter != null) {
    ctx.addIssue({
      code: 'custom',
      path: ['sessionFilter'],
      message: 'A streak counts days, so it cannot be limited to morning or evening',
    })
  }
  if (v.startDate && v.endDate && isValidDateString(v.startDate) && isValidDateString(v.endDate)) {
    const span = diffDays(v.startDate, v.endDate)
    if (span < 0) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date' })
    } else if (span > EVENT_LIMITS.maxWindowSpanDays) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'An event can run for at most 366 days' })
    }
  }
  if (v.rewardXp !== undefined && !(v.rewardXp > 0) && !v.rewardText) {
    ctx.addIssue({
      code: 'custom',
      path: ['rewardXp'],
      message: 'Give a bonus XP amount, an item reward, or both',
    })
  }
}

const createShape = z.object(eventFieldsShape).strict()

/** POST body. */
export const createEventSchema = createShape.superRefine(crossFieldChecks)
export type CreateEventInput = z.infer<typeof createEventSchema>

/**
 * PATCH body: any subset. The route merges it onto the stored row and
 * re-validates the merged result with `createEventSchema`, so cross-field rules
 * (e.g. clearing rewardText while rewardXp is 0) still hold.
 */
// .partial() keeps .default(), which would silently reset rewardXp / isActive on a
// PATCH that does not mention them, so those two are redeclared without defaults.
export const updateEventSchema = createShape
  .partial()
  .extend({
    rewardXp: eventFieldsShape.rewardXp.unwrap().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
export type UpdateEventInput = z.infer<typeof updateEventSchema>

/** Fields that define what "completing" means; locked once anyone completed. */
export const EVENT_LOCKED_FIELDS = [
  'goalType',
  'goalTarget',
  'minSessionMinutes',
  'sessionFilter',
  'startDate',
] as const

export const giveRewardSchema = z.object({ memberId: z.string().uuid() }).strict()

// ── Progress ──────────────────────────────────────────────────────────────────

interface ResolvedRow {
  day: DateString
  session: EventSessionFilter | null
  checkOut: Date | null
  savedAt: Date | null
}

function asDate(value: string | Date | null): Date | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Effective day per row, resolved against every raw date (like attendedDays). */
function resolveRows(rows: readonly EventAttendanceRow[]): ResolvedRow[] {
  const rawDates = new Set(rows.map(r => r.date))
  return rows.map(r => ({
    day: effectiveDay({ date: r.date, createdAt: r.createdAt }, d => rawDates.has(d)),
    session: r.session,
    checkOut: asDate(r.checkOutTime),
    savedAt: asDate(r.createdAt),
  }))
}

interface Window {
  start: DateString
  end: DateString
}

const inWindow = (day: DateString, w: Window) => day >= w.start && day <= w.end

function matchesSession(row: ResolvedRow, filter: EventSessionFilter | null): boolean {
  return filter == null || row.session === filter
}

/** Distinct attended days inside the window, optionally for one session. */
export function checkinDays(
  rows: readonly EventAttendanceRow[],
  window: Window,
  sessionFilter: EventSessionFilter | null = null,
): number {
  const days = new Set<DateString>()
  for (const r of resolveRows(rows)) {
    if (inWindow(r.day, window) && matchesSession(r, sessionFilter)) days.add(r.day)
  }
  return days.size
}

/** Longest run of consecutive attended days fully inside the window. */
export function longestStreakInWindow(rows: readonly EventAttendanceRow[], window: Window): number {
  const days = new Set<DateString>()
  for (const r of resolveRows(rows)) if (inWindow(r.day, window)) days.add(r.day)

  let longest = 0
  let run = 0
  let previous: DateString | null = null
  for (const day of [...days].sort()) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1
    if (run > longest) longest = run
    previous = day
  }
  return longest
}

/** Distinct days with a checked-out session of at least `minMinutes`. */
export function longSessionDays(
  rows: readonly EventAttendanceRow[],
  window: Window,
  minMinutes: number,
  sessionFilter: EventSessionFilter | null = null,
): number {
  const days = new Set<DateString>()
  for (const r of resolveRows(rows)) {
    if (!inWindow(r.day, window) || !matchesSession(r, sessionFilter)) continue
    // A session with no check-out never counts, whatever else is true.
    if (r.checkOut == null || r.savedAt == null) continue
    if (r.checkOut.getTime() - r.savedAt.getTime() >= minMinutes * 60_000) days.add(r.day)
  }
  return days.size
}

/**
 * Progress of one member towards one event. Days after the real IST today are
 * ignored (a forward-dated row cannot finish a goal early).
 */
export function eventProgress(
  rule: EventRule,
  rows: readonly EventAttendanceRow[],
  now: Date | string | number = new Date(),
): number {
  const today = istToday(now)
  const window: Window = { start: rule.startDate, end: rule.endDate < today ? rule.endDate : today }
  if (window.end < window.start) return 0

  switch (rule.goalType) {
    case 'streak_days':
      return longestStreakInWindow(rows, window)
    case 'long_sessions':
      return rule.minSessionMinutes == null
        ? 0
        : longSessionDays(rows, window, rule.minSessionMinutes, rule.sessionFilter)
    default:
      return checkinDays(rows, window, rule.sessionFilter)
  }
}

export function isEventComplete(rule: EventRule, progress: number): boolean {
  return progress >= rule.goalTarget
}
