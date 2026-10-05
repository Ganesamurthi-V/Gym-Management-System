import { describe, expect, it } from 'vitest'
import { reportSchema, type ReportData } from '@/app/owner/reports/report-data'
import { monthChange, runRate, weekdayInsight } from '@/app/owner/reports/insights'

const month = (label: string, total: number): ReportData['months'][number] => ({
  label, total, memberships: total, dues: 0, inventory: 0, cash: 0, upi: total, card: 0, transactions: total > 0 ? 1 : 0, newMembers: 0, renewals: 0,
})
const months = (...totals: number[]) => ['May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'].map((label, i) => month(label, totals[i]))

function report(overrides: Partial<ReportData> = {}): ReportData {
  return {
    months: months(0, 0, 0, 0, 0, 0),
    members: { total: 0, active: 0, expired: 0, expiring7: 0, expiring30: 0, renewal7: 0, renewal30: 0 },
    plans: [],
    expiring: [],
    lapsed: { count: 0, top: [] },
    dues: { total: 0, count: 0, top: [] },
    attendance: {
      tracked: false, today: 0, total: 0, morning: 0, evening: 0,
      byDay: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(name => ({ name, count: 0 })),
    },
    inactive: { count: 0, top: [] },
    areas: [],
    ...overrides,
  }
}

describe('reportSchema', () => {
  it('accepts the shape the page is built on', () => {
    expect(reportSchema.safeParse(report()).success).toBe(true)
  })

  it('rejects the payload of an older function', () => {
    const june = { months: [], expiredCount: 3, activeCount: 9, membersWithDues: [], totalDuesAmount: 0, expiringMembers: [] }
    expect(reportSchema.safeParse(june).success).toBe(false)
    const { lapsed: _lapsed, ...withoutLapsed } = report()
    expect(reportSchema.safeParse(withoutLapsed).success).toBe(false)
  })

  it('rejects a missing payload', () => {
    expect(reportSchema.safeParse(null).success).toBe(false)
  })
})

describe('runRate', () => {
  it('needs two complete months of collections', () => {
    expect(runRate(months(0, 0, 0, 0, 0, 0))).toBeNull()
    expect(runRate(months(0, 0, 0, 0, 40000, 90000))).toBeNull()
  })

  it('ignores the unfinished current month and the months before the gym took money', () => {
    expect(runRate(months(0, 0, 60000, 30000, 90000, 5000))).toEqual({ average: 60000, low: 30000, high: 90000, basis: 3 })
  })

  it('averages the three most recent complete months', () => {
    expect(runRate(months(10000, 200000, 30000, 60000, 90000, 0))).toEqual({ average: 60000, low: 10000, high: 200000, basis: 3 })
  })
})

describe('monthChange', () => {
  it('compares this month with last month', () => {
    expect(monthChange(months(0, 0, 0, 0, 50000, 60000))).toBeCloseTo(0.2)
    expect(monthChange(months(0, 0, 0, 0, 50000, 25000))).toBeCloseTo(-0.5)
  })

  it('has nothing to say when last month was empty', () => {
    expect(monthChange(months(0, 0, 0, 0, 0, 60000))).toBeNull()
  })
})

describe('weekdayInsight', () => {
  it('is null without check-ins', () => {
    expect(weekdayInsight(report().attendance)).toBeNull()
  })

  it('names the busiest and quietest day and the morning share', () => {
    const insight = weekdayInsight({
      tracked: true, today: 4, total: 100, morning: 60, evening: 40,
      byDay: [['Sun', 5], ['Mon', 30], ['Tue', 15], ['Wed', 15], ['Thu', 15], ['Fri', 10], ['Sat', 10]].map(([name, count]) => ({ name: name as string, count: count as number })),
    })
    expect(insight).toEqual({ busiest: { name: 'Monday', count: 30 }, quietest: { name: 'Sunday', count: 5 }, morningShare: 0.6 })
  })
})
