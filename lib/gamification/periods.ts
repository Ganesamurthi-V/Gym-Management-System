/**
 * Date helpers for gamification. Pure: every function takes `now` explicitly.
 *
 * All dates are Asia/Kolkata calendar dates as 'YYYY-MM-DD' strings. Strings in
 * that format sort chronologically, so they are compared with < and > directly.
 * Mirrors the SQL: `(now() AT TIME ZONE 'Asia/Kolkata')::date` and
 * `((now() - interval '5 hours') AT TIME ZONE 'Asia/Kolkata')::date`.
 */

import { BOARD_WINDOW_DAYS, DAY_ROLLOVER_GRACE_HOURS, IST_OFFSET_MINUTES } from './constants'
import type { DateString } from './types'

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface DayWindow {
  /** Inclusive. */
  start: DateString
  /** Inclusive. */
  end: DateString
}

function toDate(instant: Date | string | number): Date {
  return instant instanceof Date ? instant : new Date(instant)
}

/** Shift an instant so its UTC fields read as IST wall-clock fields. */
function shiftToIst(instant: Date | string | number): Date {
  return new Date(toDate(instant).getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE)
}

/** True for a real calendar date in 'YYYY-MM-DD' form ("2026-02-30" is false). */
export function isValidDateString(value: unknown): value is DateString {
  if (typeof value !== 'string') return false
  const m = DATE_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === value
}

/** The IST calendar date of an instant. */
export function istDateOf(instant: Date | string | number): DateString {
  return shiftToIst(instant).toISOString().slice(0, 10)
}

/** Minutes since IST midnight (0..1439) of an instant. */
export function istMinutesOfDay(instant: Date | string | number): number {
  const d = shiftToIst(instant)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** Today's real calendar date in IST. */
export function istToday(now: Date | string | number = new Date()): DateString {
  return istDateOf(now)
}

/**
 * The day the gym is still "in" for streak purposes: the IST date of
 * now minus the rollover tolerance. Internal — never display this as "today".
 */
export function gymToday(now: Date | string | number = new Date()): DateString {
  return istDateOf(toDate(now).getTime() - DAY_ROLLOVER_GRACE_HOURS * 60 * MS_PER_MINUTE)
}

export function addDays(date: DateString, days: number): DateString {
  const m = DATE_RE.exec(date)
  if (!m) throw new Error(`Invalid date: ${date}`)
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: DateString, to: DateString): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY)
}

/** 0 = Sunday .. 6 = Saturday, same as Postgres EXTRACT(DOW). */
export function dayOfWeek(date: DateString): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * The rolling window of `days` days ending at gym-today, inclusive on both
 * ends: 7 -> [gymToday - 6, gymToday]. Rolling means there is no Monday or
 * 1st-of-month reset; the window simply slides.
 */
export function rollingWindow(days: number, now: Date | string | number = new Date()): DayWindow {
  const end = gymToday(now)
  return { start: addDays(end, -(Math.max(1, Math.floor(days)) - 1)), end }
}

export function weekWindow(now: Date | string | number = new Date()): DayWindow {
  return rollingWindow(BOARD_WINDOW_DAYS.week, now)
}

export function monthWindow(now: Date | string | number = new Date()): DayWindow {
  return rollingWindow(BOARD_WINDOW_DAYS.month, now)
}

export function isInWindow(day: DateString, window: DayWindow): boolean {
  return day >= window.start && day <= window.end
}

export function countDaysInWindow(days: readonly DateString[], window: DayWindow): number {
  let n = 0
  for (const day of new Set(days)) if (isInWindow(day, window)) n++
  return n
}
