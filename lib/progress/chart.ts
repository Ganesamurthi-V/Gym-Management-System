/** Pure helpers for the weight chart and progress date text. No React, no Date-from-string timezone shifts. */

export interface Point { date: string; value: number }

const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' -> day number (UTC midnight, so no local timezone shift). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** Round min/max out to a tidy step with padding. Flat or empty data gets a +-2 window. */
export function niceRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo
  const step = span <= 4 ? 1 : span <= 12 ? 2 : span <= 30 ? 5 : 10
  if (span === 0) return { min: Math.floor(lo - 2), max: Math.ceil(hi + 2) }
  return { min: Math.floor((lo - span * 0.1) / step) * step, max: Math.ceil((hi + span * 0.1) / step) * step }
}

/** Value -> y pixel (larger value is higher, so smaller y). */
export function scaleY(value: number, min: number, max: number, top: number, bottom: number): number {
  if (max === min) return (top + bottom) / 2
  return bottom - ((value - min) / (max - min)) * (bottom - top)
}

/** Date -> x pixel. A single point sits in the middle. */
export function scaleX(date: string, firstDate: string, lastDate: string, left: number, right: number): number {
  const a = dayNumber(firstDate)
  const b = dayNumber(lastDate)
  if (a === b) return (left + right) / 2
  return left + ((dayNumber(date) - a) / (b - a)) * (right - left)
}

/** Oldest-first points from newest-first logs: last 90 days of the newest entry, at most 30 entries. */
export function chartPoints(logs: { loggedOn: string; weightKg: number | null }[]): Point[] {
  const withWeight = logs.filter((l) => l.weightKg != null)
  if (withWeight.length === 0) return []
  const newest = dayNumber(withWeight[0].loggedOn)
  return withWeight
    .filter((l) => newest - dayNumber(l.loggedOn) <= 90)
    .slice(0, 30)
    .reverse()
    .map((l) => ({ date: l.loggedOn, value: l.weightKg as number }))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** '2026-09-03' -> '3 Sep' */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** '2026-09-03' -> 'Thu, 3 Sep 2026' */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${wd}, ${d} ${MONTHS[m - 1]} ${y}`
}

/** '2026-10-27' -> '27 Oct 2026' */
export function mediumDate(date: string): string {
  return `${shortDate(date)} ${date.slice(0, 4)}`
}

/** ISO timestamp -> IST 'YYYY-MM-DD'. */
export function istDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 19_800_000).toISOString().slice(0, 10)
}

/** 2520 -> '42 min' (under a minute shows '<1 min'). */
export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60)
  return min < 1 ? '<1 min' : `${min} min`
}

/** Drop a trailing .0: 72.4 -> '72.4', 72 -> '72'. */
export function fmtNum(n: number): string {
  return String(Math.round(n * 10) / 10)
}
