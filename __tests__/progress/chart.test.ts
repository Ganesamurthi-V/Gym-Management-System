import { describe, it, expect } from 'vitest'
import {
  niceRange, scaleX, scaleY, chartPoints, shortDate, longDate, istDateOf, formatDuration, fmtNum, dayNumber,
} from '@/lib/progress/chart'

describe('niceRange', () => {
  it('pads and rounds', () => {
    const r = niceRange([70, 74])
    expect(r.min).toBeLessThanOrEqual(70)
    expect(r.max).toBeGreaterThanOrEqual(74)
  })
  it('handles a single or flat value', () => {
    expect(niceRange([72])).toEqual({ min: 70, max: 74 })
  })
  it('handles empty', () => {
    expect(niceRange([])).toEqual({ min: 0, max: 1 })
  })
})

describe('scales', () => {
  it('maps value to y, higher is smaller y', () => {
    expect(scaleY(10, 0, 10, 0, 100)).toBe(0)
    expect(scaleY(0, 0, 10, 0, 100)).toBe(100)
    expect(scaleY(5, 5, 5, 0, 100)).toBe(50)
  })
  it('maps date to x and centres a single point', () => {
    expect(scaleX('2026-09-01', '2026-09-01', '2026-09-11', 0, 100)).toBe(0)
    expect(scaleX('2026-09-06', '2026-09-01', '2026-09-11', 0, 100)).toBe(50)
    expect(scaleX('2026-09-01', '2026-09-01', '2026-09-01', 0, 100)).toBe(50)
  })
  it('counts days across month ends', () => {
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1)
  })
})

describe('chartPoints', () => {
  it('returns oldest first, within 90 days, skipping null weights', () => {
    const logs = [
      { loggedOn: '2026-09-10', weightKg: 70 },
      { loggedOn: '2026-09-05', weightKg: null },
      { loggedOn: '2026-08-01', weightKg: 71 },
      { loggedOn: '2026-01-01', weightKg: 80 },
    ]
    expect(chartPoints(logs).map((p) => p.date)).toEqual(['2026-08-01', '2026-09-10'])
  })
  it('caps at 30 entries', () => {
    const logs = Array.from({ length: 50 }, (_, i) => ({ loggedOn: `2026-09-${String(30 - (i % 30)).padStart(2, '0')}`, weightKg: 70 }))
    expect(chartPoints(logs).length).toBeLessThanOrEqual(30)
  })
  it('empty in, empty out', () => {
    expect(chartPoints([])).toEqual([])
  })
})

describe('formatting', () => {
  it('formats dates without timezone shifts', () => {
    expect(shortDate('2026-09-03')).toBe('3 Sep')
    expect(longDate('2026-09-03')).toBe('Thu, 3 Sep 2026')
  })
  it('converts a UTC timestamp to the IST day', () => {
    expect(istDateOf('2026-09-03T19:00:00Z')).toBe('2026-09-04')
    expect(istDateOf('2026-09-03T10:00:00Z')).toBe('2026-09-03')
  })
  it('formats duration and numbers', () => {
    expect(formatDuration(2520)).toBe('42 min')
    expect(formatDuration(20)).toBe('<1 min')
    expect(fmtNum(72)).toBe('72')
    expect(fmtNum(72.46)).toBe('72.5')
  })
})
