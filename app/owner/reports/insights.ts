import type { ReportData } from './report-data'

/**
 * What the Reports page concludes from its numbers, as plain functions of the
 * report payload. Nothing here invents a figure: when the data cannot support a
 * conclusion the function returns null and the page shows an empty state.
 */

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export interface RunRate {
  /** Mean of the most recent complete months (up to three). */
  average: number
  low: number
  high: number
  /** How many complete months the average covers. */
  basis: number
}

/**
 * What a month usually brings in. Uses complete months only — the current month
 * is still filling up — and starts at the gym's first month with any collections,
 * so a gym that opened recently is not averaged against the months before it
 * existed. Null with fewer than two such months.
 */
export function runRate(months: ReportData['months']): RunRate | null {
  const complete = months.slice(0, -1).map(m => m.total)
  const first = complete.findIndex(total => total > 0)
  if (first === -1) return null
  const history = complete.slice(first)
  if (history.length < 2) return null
  const recent = history.slice(-3)
  return {
    average: Math.round(sum(recent) / recent.length),
    low: Math.min(...history),
    high: Math.max(...history),
    basis: recent.length,
  }
}

/**
 * This month against last month, as a signed share (0.2 = 20% more). Null when
 * last month had no collections — "up ∞%" tells an owner nothing.
 */
export function monthChange(months: ReportData['months']): number | null {
  const current = months[months.length - 1].total
  const previous = months[months.length - 2].total
  return previous > 0 ? (current - previous) / previous : null
}

export interface WeekdayInsight {
  busiest: { name: string; count: number }
  quietest: { name: string; count: number }
  /** Morning-session share of check-ins (0–1). */
  morningShare: number
}

const DAY_NAMES: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' }

export function weekdayInsight(attendance: ReportData['attendance']): WeekdayInsight | null {
  if (attendance.total === 0) return null
  const ordered = attendance.byDay
    .map(day => ({ name: DAY_NAMES[day.name] ?? day.name, count: day.count }))
    .sort((a, b) => b.count - a.count)
  return {
    busiest: ordered[0],
    quietest: ordered[ordered.length - 1],
    morningShare: attendance.morning / attendance.total,
  }
}
