/**
 * lib/import/membershipDates.ts
 * ─────────────────────────────
 * Pure date rules for importing EXISTING members. A member who bought a year and has
 * used six months must arrive with the sheet's start date and start + plan length as
 * the end date, so roughly six months remain. Never "today + plan".
 *
 * Shared by the import preview (browser) and POST /api/import/confirm (server) so the
 * two always agree. Everything works on yyyy-MM-dd strings with an injected `today`
 * (the IST date); nothing here reads the clock or the machine's time zone.
 */
import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { MemberStatus } from '@/types'

/** Months the three stored plan labels stand for when the sheet states nothing more exact. */
export const PLAN_STANDARD_MONTHS = { monthly: 1, quarterly: 3, annual: 12 } as const
export type ImportPlan = keyof typeof PLAN_STANDARD_MONTHS

export const MIN_START_YEAR = 2000
/** A start date further ahead than this is treated as a typo, not a membership booked in advance. */
export const MAX_FUTURE_START_DAYS = 366
/** Longest plan the importer will count (matches the plan-length recogniser). */
export const MAX_PLAN_MONTHS = 60

/** Months a plan label runs when the row carries no exact length. */
export function monthsForPlan(plan: string, durationMonths?: number | null): number {
  if (durationMonths !== undefined && durationMonths !== null && Number.isFinite(durationMonths)) return durationMonths
  return PLAN_STANDARD_MONTHS[plan as ImportPlan] ?? 1
}

/** The stored label an exact length belongs to (same bands as the plan recogniser). */
export function planForMonths(months: number): ImportPlan {
  if (months <= 1.5) return 'monthly'
  if (months <= 8) return 'quarterly'
  return 'annual'
}

// ── Start date parsing ───────────────────────────────────────────────────────

export type StartDateResult =
  | { ok: true; date: string }
  | { ok: false; reason: 'blank' | 'unparseable' | 'out_of_range'; message: string }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** yyyy-MM-dd for a real calendar day, otherwise null (31/02, month 13, ...). */
export function toIsoDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`
}

/** Excel 1900 date system: serial 1 = 1900-01-01 (with its 1900 leap-year quirk), 25569 = 1970-01-01. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 61 || serial > 2958465) return null
  const d = new Date(Math.floor(serial - 25569) * 86400000)
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

function shortYear(y: string): number {
  return y.length === 2 ? 2000 + Number(y) : Number(y)
}

/**
 * Reads one start-date cell. India writes day first, so 03/04/2026 is 3 April.
 * Accepts yyyy-mm-dd (optionally with a time), dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy,
 * d/m/yy, dd MMM yyyy and an Excel serial number. A blank, unreadable or absurd
 * value is reported, never replaced by today.
 */
export function parseStartDate(raw: string | null | undefined, today: string): StartDateResult {
  const t = (raw ?? '').trim().replace(/[T\s]+\d{1,2}:\d{2}.*$/, '')
  if (!t) return { ok: false, reason: 'blank', message: 'Start date is missing' }

  let iso: string | null = null
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    iso = toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]))
  } else if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/))) {
    iso = toIsoDate(shortYear(m[3]), Number(m[2]), Number(m[1]))
  } else if ((m = t.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4}|\d{2})$/))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mi >= 0) iso = toIsoDate(shortYear(m[3]), mi + 1, Number(m[1]))
  } else if (/^\d+(\.\d+)?$/.test(t)) {
    iso = excelSerialToIso(Number(t))
  }

  if (!iso) return { ok: false, reason: 'unparseable', message: `Start date "${t.slice(0, 30)}" is not a date we can read` }

  const latest = format(addDays(parseISO(today), MAX_FUTURE_START_DAYS), 'yyyy-MM-dd')
  if (Number(iso.slice(0, 4)) < MIN_START_YEAR || iso > latest) {
    return { ok: false, reason: 'out_of_range', message: `Start date ${iso} looks wrong (before ${MIN_START_YEAR} or more than a year ahead)` }
  }
  return { ok: true, date: iso }
}

// ── Membership dates ─────────────────────────────────────────────────────────

export interface ImportedMembership {
  startDate: string
  endDate: string
  /** endDate - today in calendar days; negative once the plan has ended. */
  daysLeft: number
  status: MemberStatus
  startsInFuture: boolean
}

/**
 * start -> end -> days left. A whole number of months uses calendar months (31 Jan + 1
 * month = 28/29 Feb, like date-fns addMonths); a part month (45 days = 1.5) is counted in
 * days. The end date is never later than start + the plan length, and a plan that has
 * already ended stays ended: nothing is extended to today.
 */
export function resolveImportedMembership(input: {
  startDate: string
  durationMonths: number
  today: string
}): ImportedMembership {
  const { startDate, durationMonths, today } = input
  const start = parseISO(startDate)
  const whole = Math.abs(durationMonths - Math.round(durationMonths)) < 1e-9
  const end = whole ? addMonths(start, Math.round(durationMonths)) : addDays(start, Math.round(durationMonths * 30))
  const endDate = format(end, 'yyyy-MM-dd')
  const daysLeft = differenceInCalendarDays(parseISO(endDate), parseISO(today))
  // Same thresholds as getMemberStatus in lib/utils.ts.
  const status: MemberStatus = daysLeft < 0 ? 'expired' : daysLeft <= 7 ? 'expiring' : 'active'
  return { startDate, endDate, daysLeft, status, startsInFuture: startDate > today }
}
