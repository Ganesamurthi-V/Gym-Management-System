import { describe, it, expect } from 'vitest'
import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  excelSerialToIso, monthsForPlan, parseStartDate, planForMonths, resolveImportedMembership,
} from '@/lib/import/membershipDates'
import { excelSerialToDate, cellStr } from '@/lib/import/normalizers'
import { recognizePlanDuration, recognizePlanMonths } from '@/lib/import/plan-matching'

const TODAY = '2026-10-28'
const resolve = (startDate: string, durationMonths: number) => resolveImportedMembership({ startDate, durationMonths, today: TODAY })

describe('resolveImportedMembership', () => {
  it('12-month plan started 6 months ago keeps about 6 months', () => {
    const m = resolve('2026-04-28', 12)
    expect(m.endDate).toBe('2027-04-28')
    expect(m.daysLeft).toBe(182)
    expect(m.status).toBe('active')
  })
  it('12-month plan started 13 months ago is expired, not extended', () => {
    const m = resolve('2025-09-28', 12)
    expect(m.endDate).toBe('2026-09-28')
    expect(m.daysLeft).toBeLessThan(0)
    expect(m.status).toBe('expired')
  })
  it('1-month plan started 45 days ago stays expired at start + 1 month', () => {
    const start = format(addDays(parseISO(TODAY), -45), 'yyyy-MM-dd')
    const m = resolve(start, 1)
    expect(m.endDate).toBe(format(addMonths(parseISO(start), 1), 'yyyy-MM-dd'))
    expect(m.endDate < TODAY).toBe(true)
    expect(m.status).toBe('expired')
  })
  it('3-month plan starting today runs 3 months', () => {
    const m = resolve(TODAY, 3)
    expect(m.endDate).toBe('2027-01-28')
    expect(m.daysLeft).toBe(92)
    expect(m.startsInFuture).toBe(false)
  })
  it('a plan ending exactly today is still active today', () => {
    const m = resolve('2026-09-28', 1)
    expect(m.endDate).toBe(TODAY)
    expect(m.daysLeft).toBe(0)
    expect(m.status).toBe('expiring')
  })
  it('clamps month ends like date-fns addMonths', () => {
    expect(resolve('2026-01-31', 1).endDate).toBe('2026-02-28')
    expect(resolve('2024-01-31', 1).endDate).toBe('2024-02-29')
  })
  it('counts a custom 18 month plan in full, and a part month in days', () => {
    expect(resolve('2026-04-28', 18).endDate).toBe('2027-10-28')
    expect(resolve('2026-10-01', 1.5).endDate).toBe('2026-11-15') // 45 days
  })
  it('uses owner-defined plan lengths (2, 6, 24 months)', () => {
    expect(resolve('2026-10-28', 2).endDate).toBe('2026-12-28')
    expect(resolve('2026-10-28', 6).endDate).toBe('2027-04-28')
    expect(resolve('2026-10-28', 24).endDate).toBe('2028-10-28')
  })
  it('a start date in the future is flagged and counts from that start', () => {
    const m = resolve('2026-11-04', 1)
    expect(m.startsInFuture).toBe(true)
    expect(m.endDate).toBe('2026-12-04')
    expect(m.daysLeft).toBe(37)
  })
  it('end - start never exceeds the plan length and daysLeft = end - today (random)', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let i = 0; i < 500; i++) {
      const start = format(addDays(parseISO('2022-01-01'), Math.floor(rnd() * 1800)), 'yyyy-MM-dd')
      const months = [1, 3, 6, 12, 18, 24][Math.floor(rnd() * 6)]
      const m = resolve(start, months)
      const limit = format(addMonths(parseISO(start), months), 'yyyy-MM-dd')
      expect(m.endDate <= limit).toBe(true)
      expect(m.endDate >= start).toBe(true)
      expect(m.daysLeft).toBe(differenceInCalendarDays(parseISO(m.endDate), parseISO(TODAY)))
      expect(m.status === 'expired').toBe(m.endDate < TODAY)
    }
  })
})

describe('plan lengths', () => {
  it('monthsForPlan prefers the sheet length, else the label', () => {
    expect(monthsForPlan('annual')).toBe(12)
    expect(monthsForPlan('quarterly', 6)).toBe(6)
    expect(monthsForPlan('annual', 18)).toBe(18)
  })
  it('planForMonths matches the recogniser bands', () => {
    for (const m of [1, 3, 6, 8, 9, 12, 18, 24]) {
      expect(planForMonths(m)).toBe(recognizePlanDuration(`${m} months`))
    }
  })
  it('recognizePlanMonths keeps the stated length instead of the bucket', () => {
    expect(recognizePlanMonths('18 months')).toBe(18)
    expect(recognizePlanMonths('6 months')).toBe(6)
    expect(recognizePlanMonths('half yearly')).toBe(6)
    expect(recognizePlanMonths('2 years')).toBe(24)
    expect(recognizePlanMonths('45 days')).toBe(1.5)
    expect(recognizePlanMonths('Monthly')).toBe(1)
    expect(recognizePlanMonths('Quarterly')).toBe(3)
    expect(recognizePlanMonths('Annual')).toBe(12)
    expect(recognizePlanMonths('1 year 6 months')).toBeNull()
    expect(recognizePlanMonths('Gold')).toBeNull()
  })
})

describe('parseStartDate', () => {
  const ok = (raw: string) => {
    const r = parseStartDate(raw, TODAY)
    return r.ok ? r.date : r.reason
  }
  it('flags blank and unparseable cells, never today', () => {
    expect(ok('')).toBe('blank')
    expect(ok('   ')).toBe('blank')
    expect(ok('soon')).toBe('unparseable')
    expect(ok('31/02/2026')).toBe('unparseable')
    expect(ok('13/13/2026')).toBe('unparseable')
  })
  it('reads dd/mm/yyyy day first', () => {
    expect(ok('03/04/2026')).toBe('2026-04-03')
    expect(ok('3/4/2026')).toBe('2026-04-03')
    expect(ok('28-10-2026')).toBe('2026-10-28')
    expect(ok('28.10.2026')).toBe('2026-10-28')
    expect(ok('03/04/26')).toBe('2026-04-03')
  })
  it('reads ISO, with or without a time', () => {
    expect(ok('2026-04-03')).toBe('2026-04-03')
    expect(ok('2026-04-03T00:00:00.000Z')).toBe('2026-04-03')
    expect(ok('2026-04-03 10:30:00')).toBe('2026-04-03')
  })
  it('reads month names', () => {
    expect(ok('3 Apr 2026')).toBe('2026-04-03')
    expect(ok('03-Apr-26')).toBe('2026-04-03')
    expect(ok('3 April 2026')).toBe('2026-04-03')
  })
  it('reads an Excel serial number', () => {
    expect(ok('46115')).toBe('2026-04-03')
    expect(excelSerialToIso(46115)).toBe('2026-04-03')
    expect(ok('46115.75')).toBe('2026-04-03')
    expect(excelSerialToDate(46115)).toBe('2026-04-03')
  })
  it('reads a real Date at midnight UTC (what ExcelJS returns) as that calendar day', () => {
    expect(cellStr(new Date(Date.UTC(2026, 3, 3)))).toBe('2026-04-03')
  })
  it('refuses absurd years', () => {
    expect(ok('01/01/1990')).toBe('out_of_range')
    expect(ok('2026-04-03T00:00:00Z'.replace('2026', '1899'))).toBe('out_of_range')
    expect(ok('01/01/2031')).toBe('out_of_range')
    expect(ok('2027-10-28')).toBe('2027-10-28') // exactly a year ahead is allowed
    expect(ok('2027-10-30')).toBe('out_of_range')
  })
  it('a future start inside the limit is accepted', () => {
    expect(ok('2026-11-04')).toBe('2026-11-04')
  })
})
