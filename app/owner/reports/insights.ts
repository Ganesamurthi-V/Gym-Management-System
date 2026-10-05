import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { ReportData } from './report-data'

/**
 * Everything the Reports page concludes from its numbers lives here, as plain
 * functions of the report payload. Nothing in this file invents a figure: when
 * the data cannot support a conclusion the function returns null and the page
 * shows an empty state instead.
 */

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/**
 * Share of what was billed that has actually come in (0–1): collections over the
 * six months on the page, against those collections plus everything still owed.
 * Null when nothing was collected and nothing is owed.
 */
export function collectionRate(data: ReportData): number | null {
  const collected = sum(data.months.map(m => m.total))
  const billed = collected + data.dues.total
  return billed > 0 ? collected / billed : null
}

export type HealthStatus = 'Excellent' | 'Healthy' | 'Warning' | 'Critical'

export interface Health {
  score: number
  status: HealthStatus
  /** Active members as a share of all members (0–1). */
  activeShare: number
  /** See `collectionRate`. A gym with nothing billed is not penalised. */
  collected: number
}

/**
 * A 0–100 summary: 60 points for the share of members whose plan is current, 40
 * for the share of billed money collected. Null for a gym with no members.
 */
export function healthScore(data: ReportData): Health | null {
  if (data.members.total === 0) return null
  const activeShare = data.members.active / data.members.total
  const collected = collectionRate(data) ?? 1
  const score = Math.round(activeShare * 60 + collected * 40)
  const status: HealthStatus = score >= 85 ? 'Excellent' : score >= 70 ? 'Healthy' : score >= 50 ? 'Warning' : 'Critical'
  return { score, status, activeShare, collected }
}

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

export type RiskKind = 'dues' | 'renewal' | 'checkin'

export interface RiskMember {
  name: string
  phone: string
  kind: RiskKind
  level: 'High' | 'Medium'
  reason: string
  /** Amount owed, plan end date, or last check-in date — whatever `kind` needs for its message. */
  detail: string | null
}

/**
 * The members most worth a message today, a couple from each real signal: money
 * owed, a plan ending this week, and — only where attendance is being marked —
 * a paying member who has stopped coming.
 */
export function atRiskMembers(data: ReportData, today: string): RiskMember[] {
  const risks: RiskMember[] = []

  for (const m of data.dues.top.slice(0, 2)) {
    risks.push({
      name: m.name,
      phone: m.phone,
      kind: 'dues',
      level: 'High',
      reason: `Owes ₹${m.amount.toLocaleString('en-IN')}`,
      detail: String(m.amount),
    })
  }

  const endingThisWeek = data.expiring.filter(m => differenceInCalendarDays(parseISO(m.endDate), parseISO(today)) <= 7)
  for (const m of endingThisWeek.slice(0, 2)) {
    const days = differenceInCalendarDays(parseISO(m.endDate), parseISO(today))
    risks.push({
      name: m.name,
      phone: m.phone,
      kind: 'renewal',
      level: 'Medium',
      reason: days === 0 ? 'Plan ends today' : `Plan ends in ${days} day${days === 1 ? '' : 's'}`,
      detail: m.endDate,
    })
  }

  if (data.attendance.tracked) {
    for (const m of data.inactive.top.slice(0, 2)) {
      const days = m.lastVisit ? differenceInCalendarDays(parseISO(today), parseISO(m.lastVisit)) : null
      risks.push({
        name: m.name,
        phone: m.phone,
        kind: 'checkin',
        level: days === null || days >= 14 ? 'High' : 'Medium',
        reason: days === null ? 'No check-in in 90 days' : `Last check-in ${days} days ago`,
        detail: m.lastVisit,
      })
    }
  }

  return risks
}

export interface Recommendation {
  id: 'dues' | 'annual' | 'lapsed' | 'attendance'
  tone: 'critical' | 'growth' | 'operations'
  badge: string
  title: string
  body: string
  action: string
}

const inr = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`
const pct = (share: number) => `${Math.round(share * 100)}%`

/** At most three suggestions, each one triggered by — and quoting — a real figure. */
export function recommendations(data: ReportData): Recommendation[] {
  const items: Recommendation[] = []
  const rate = runRate(data.months)

  if (data.dues.total > 0 && (!rate || data.dues.total >= rate.average * 0.1)) {
    items.push({
      id: 'dues',
      tone: 'critical',
      badge: 'Collections',
      title: 'Collect outstanding dues',
      body: rate && rate.average > 0
        ? `${inr(data.dues.total)} is owed by ${data.dues.count} member${data.dues.count === 1 ? '' : 's'} — ${pct(data.dues.total / rate.average)} of an average month's collections.`
        : `${inr(data.dues.total)} is owed by ${data.dues.count} member${data.dues.count === 1 ? '' : 's'}.`,
      action: 'Open dues',
    })
  }

  const annual = data.plans.find(p => p.plan === 'annual')?.count ?? 0
  if (data.members.active >= 10 && annual / data.members.active < 0.2) {
    items.push({
      id: 'annual',
      tone: 'growth',
      badge: 'Plan mix',
      title: 'Offer the annual plan at renewal',
      body: `Only ${pct(annual / data.members.active)} of active members are on the annual plan. ${data.members.expiring30} plan${data.members.expiring30 === 1 ? ' ends' : 's end'} in the next 30 days — the moment to offer it.`,
      action: 'View expiring',
    })
  }

  if (data.members.expired > 0 && data.members.expired >= data.members.active * 0.25) {
    items.push({
      id: 'lapsed',
      tone: 'growth',
      badge: 'Win-back',
      title: 'Bring back lapsed members',
      body: `${data.members.expired} member${data.members.expired === 1 ? ' has' : 's have'} no current plan, against ${data.members.active} active.`,
      action: 'View expired',
    })
  }

  const week = weekdayInsight(data.attendance)
  if (week && data.attendance.total >= 50 && week.busiest.count >= week.quietest.count * 2) {
    items.push({
      id: 'attendance',
      tone: 'operations',
      badge: 'Footfall',
      title: `${week.busiest.name} is your busiest day`,
      body: `${week.busiest.name} had ${week.busiest.count} check-ins in the last 90 days; ${week.quietest.name}, the quietest day, had ${week.quietest.count}. ${pct(week.morningShare)} of all check-ins are in the morning session.`,
      action: 'See attendance',
    })
  }

  return items.slice(0, 3)
}

/** `_gymflow_expiry_reminder` → `Expiry reminder`. */
export function templateLabel(template: string): string {
  const words = template.replace(/^_?gymflow_/, '').replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : template
}
