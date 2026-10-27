import { describe, it, expect } from 'vitest'
import { pickPushesForDay, inPushWindow, istIsoWeek, type PushCandidate } from '@/lib/push/cap'

// 12:00 IST
const noon = new Date('2026-10-28T06:30:00Z')
const c = (memberId: string, kind: PushCandidate['kind']): PushCandidate => ({ memberId, kind })

describe('pickPushesForDay', () => {
  it('lets essential kinds through even in quiet hours and over the cap', () => {
    const night = new Date('2026-10-28T18:00:00Z') // 23:30 IST
    const out = pickPushesForDay([c('a', 'notice'), c('a', 'payment_decision'), c('a', 'expiring')], { a: { today: 5, week: 9 } }, night)
    expect(out.map(x => x.kind)).toEqual(['notice', 'payment_decision'])
  })
  it('keeps one non-essential per member per day, highest priority first', () => {
    const out = pickPushesForDay([c('a', 'weekly_quote'), c('a', 'expiring'), c('a', 'miss_you')], {}, noon)
    expect(out).toEqual([c('a', 'expiring')])
  })
  it('skips a member who already has a non-essential push today', () => {
    expect(pickPushesForDay([c('a', 'expiring')], { a: { today: 1, week: 1 } }, noon)).toEqual([])
  })
  it('skips a member at the weekly cap', () => {
    expect(pickPushesForDay([c('a', 'expiring')], { a: { today: 0, week: 4 } }, noon)).toEqual([])
    expect(pickPushesForDay([c('a', 'expiring')], { a: { today: 0, week: 3 } }, noon)).toHaveLength(1)
  })
  it('handles members independently', () => {
    const out = pickPushesForDay([c('a', 'goal'), c('b', 'goal')], { a: { today: 1, week: 1 } }, noon)
    expect(out).toEqual([c('b', 'goal')])
  })
  it('sends nothing non-essential outside 07:00-21:00 IST', () => {
    expect(inPushWindow(new Date('2026-10-28T01:29:00Z'))).toBe(false) // 06:59
    expect(inPushWindow(new Date('2026-10-28T01:30:00Z'))).toBe(true) // 07:00
    expect(inPushWindow(new Date('2026-10-28T15:29:00Z'))).toBe(true) // 20:59
    expect(inPushWindow(new Date('2026-10-28T15:30:00Z'))).toBe(false) // 21:00
    expect(pickPushesForDay([c('a', 'expiring')], {}, new Date('2026-10-28T15:30:00Z'))).toEqual([])
  })
})

describe('istIsoWeek', () => {
  it('labels the ISO week of the IST date', () => {
    expect(istIsoWeek(new Date('2026-10-28T06:30:00Z'))).toBe('2026W44')
    // Sunday 20:00 UTC is already Monday in IST
    expect(istIsoWeek(new Date('2026-11-01T20:00:00Z'))).toBe('2026W45')
  })
})
