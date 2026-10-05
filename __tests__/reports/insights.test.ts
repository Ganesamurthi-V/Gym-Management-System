import { describe, expect, it } from 'vitest'
import { reportSchema, type ReportData } from '@/app/owner/reports/report-data'
import {
  atRiskMembers, collectionRate, healthScore, recommendations, runRate, templateLabel, weekdayInsight,
} from '@/app/owner/reports/insights'

const TODAY = '2026-10-05'

const month = (label: string, total: number): ReportData['months'][number] => ({
  label, total, memberships: total, dues: 0, inventory: 0, cash: 0, upi: total, card: 0, transactions: total > 0 ? 1 : 0, units: 0,
})

function report(overrides: Partial<ReportData> = {}): ReportData {
  return {
    months: [month('May 2026', 0), month('Jun 2026', 0), month('Jul 2026', 0), month('Aug 2026', 0), month('Sep 2026', 0), month('Oct 2026', 0)],
    members: { total: 0, active: 0, expired: 0, expiring7: 0, expiring30: 0, renewal7: 0, renewal30: 0 },
    plans: [],
    expiring: [],
    dues: { total: 0, count: 0, top: [] },
    attendance: {
      tracked: false, today: 0, total: 0, morning: 0, evening: 0,
      byDay: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(name => ({ name, count: 0 })),
    },
    inactive: { count: 0, top: [] },
    areas: [],
    recentSales: [],
    whatsapp: { sent: 0, failed: 0, templates: [] },
    ...overrides,
  }
}

describe('reportSchema', () => {
  it('accepts the shape the page is built on', () => {
    expect(reportSchema.safeParse(report()).success).toBe(true)
  })

  it('rejects the payload of the pre-October function', () => {
    const old = { months: [], expiredCount: 3, activeCount: 9, membersWithDues: [], totalDuesAmount: 0, expiringMembers: [] }
    expect(reportSchema.safeParse(old).success).toBe(false)
  })

  it('rejects a missing payload', () => {
    expect(reportSchema.safeParse(null).success).toBe(false)
  })
})

describe('collectionRate', () => {
  it('is null when nothing was collected and nothing is owed', () => {
    expect(collectionRate(report())).toBeNull()
  })

  it('is collections over collections plus dues', () => {
    const data = report({
      months: [month('May 2026', 0), month('Jun 2026', 0), month('Jul 2026', 30000), month('Aug 2026', 30000), month('Sep 2026', 20000), month('Oct 2026', 10000)],
      dues: { total: 10000, count: 4, top: [] },
    })
    expect(collectionRate(data)).toBeCloseTo(0.9)
  })
})

describe('healthScore', () => {
  it('has no score for a gym with no members', () => {
    expect(healthScore(report())).toBeNull()
  })

  it('gives 100 when every member is active and nothing is owed', () => {
    const health = healthScore(report({ members: { total: 20, active: 20, expired: 0, expiring7: 0, expiring30: 0, renewal7: 0, renewal30: 0 } }))
    expect(health).toMatchObject({ score: 100, status: 'Excellent' })
  })

  it('weights active members 60 and collections 40', () => {
    const health = healthScore(report({
      months: [month('May 2026', 0), month('Jun 2026', 0), month('Jul 2026', 0), month('Aug 2026', 0), month('Sep 2026', 50000), month('Oct 2026', 0)],
      members: { total: 10, active: 5, expired: 5, expiring7: 0, expiring30: 0, renewal7: 0, renewal30: 0 },
      dues: { total: 50000, count: 3, top: [] },
    }))
    // 0.5 × 60 + 0.5 × 40
    expect(health).toMatchObject({ score: 50, status: 'Warning' })
  })
})

describe('runRate', () => {
  it('needs two complete months of collections', () => {
    expect(runRate(report().months)).toBeNull()
    const oneMonth = [month('May 2026', 0), month('Jun 2026', 0), month('Jul 2026', 0), month('Aug 2026', 0), month('Sep 2026', 40000), month('Oct 2026', 90000)]
    expect(runRate(oneMonth)).toBeNull()
  })

  it('ignores the unfinished current month and the months before the gym took money', () => {
    const months = [month('May 2026', 0), month('Jun 2026', 0), month('Jul 2026', 60000), month('Aug 2026', 30000), month('Sep 2026', 90000), month('Oct 2026', 5000)]
    expect(runRate(months)).toEqual({ average: 60000, low: 30000, high: 90000, basis: 3 })
  })

  it('averages the three most recent complete months', () => {
    const months = [month('May 2026', 10000), month('Jun 2026', 200000), month('Jul 2026', 30000), month('Aug 2026', 60000), month('Sep 2026', 90000), month('Oct 2026', 0)]
    expect(runRate(months)).toEqual({ average: 60000, low: 10000, high: 200000, basis: 3 })
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

describe('atRiskMembers', () => {
  const data = report({
    dues: { total: 3000, count: 1, top: [{ name: 'Asha', phone: '9000000001', amount: 3000 }] },
    expiring: [
      { name: 'Bala', phone: '9000000002', endDate: '2026-10-05', plan: 'monthly', amount: 1500 },
      { name: 'Chitra', phone: '9000000003', endDate: '2026-10-30', plan: 'monthly', amount: 1500 },
    ],
    inactive: { count: 2, top: [{ name: 'Dinesh', phone: '9000000004', lastVisit: null }, { name: 'Esha', phone: '9000000005', lastVisit: '2026-09-27' }] },
  })

  it('lists only members the data names, with the real reason', () => {
    const risks = atRiskMembers({ ...data, attendance: { ...data.attendance, tracked: true } }, TODAY)
    expect(risks.map(r => [r.name, r.kind, r.level, r.reason])).toEqual([
      ['Asha', 'dues', 'High', 'Owes ₹3,000'],
      ['Bala', 'renewal', 'Medium', 'Plan ends today'],
      ['Dinesh', 'checkin', 'High', 'No check-in in 90 days'],
      ['Esha', 'checkin', 'Medium', 'Last check-in 8 days ago'],
    ])
  })

  it('does not call anyone absent when attendance is not being marked', () => {
    expect(atRiskMembers(data, TODAY).some(r => r.kind === 'checkin')).toBe(false)
  })

  it('is empty for a gym with nothing to chase', () => {
    expect(atRiskMembers(report(), TODAY)).toEqual([])
  })
})

describe('recommendations', () => {
  it('says nothing when there is nothing to say', () => {
    expect(recommendations(report())).toEqual([])
  })

  it('quotes the figures that triggered it', () => {
    const items = recommendations(report({
      months: [month('May 2026', 0), month('Jun 2026', 0), month('Jul 2026', 100000), month('Aug 2026', 100000), month('Sep 2026', 100000), month('Oct 2026', 0)],
      members: { total: 60, active: 40, expired: 20, expiring7: 2, expiring30: 9, renewal7: 3000, renewal30: 20000 },
      plans: [{ plan: 'monthly', count: 36 }, { plan: 'annual', count: 4 }],
      dues: { total: 25000, count: 5, top: [] },
    }))
    expect(items.map(i => i.id)).toEqual(['dues', 'annual', 'lapsed'])
    expect(items[0].body).toContain('₹25,000 is owed by 5 members — 25% of an average month')
    expect(items[1].body).toContain('Only 10% of active members')
  })

  it('leaves small dues alone', () => {
    const items = recommendations(report({
      months: [month('May 2026', 0), month('Jun 2026', 0), month('Jul 2026', 100000), month('Aug 2026', 100000), month('Sep 2026', 100000), month('Oct 2026', 0)],
      dues: { total: 500, count: 1, top: [] },
    }))
    expect(items).toEqual([])
  })
})

describe('templateLabel', () => {
  it('turns a template id into words', () => {
    expect(templateLabel('_gymflow_expiry_reminder')).toBe('Expiry reminder')
    expect(templateLabel('birthday_wishes')).toBe('Birthday wishes')
  })
})
