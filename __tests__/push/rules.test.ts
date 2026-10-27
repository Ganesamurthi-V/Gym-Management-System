import { describe, it, expect } from 'vitest'
import { dueForMember, groupIntoJobs, isoWeekOf, weekdayOf, missYouBucket, type MemberPushFacts, type DuePush } from '@/lib/push/rules'
import { istIsoWeek } from '@/lib/push/cap'
import { istToday } from '@/lib/gamification/periods'
import { PUSH_COPY } from '@/lib/push/payload'
import { quoteForDate } from '@/lib/member/daily-quote'
import type { BodyLog } from '@/types/progress'

const log = (loggedOn: string, weightKg: number | null, waistCm: number | null = null): BodyLog => ({
  id: loggedOn, loggedOn, weightKg, waistCm, chestCm: null, hipsCm: null, armCm: null, thighCm: null,
})
const base = (over: Partial<MemberPushFacts> = {}): MemberPushFacts => ({
  memberId: 'm1', latestEnd: '2099-01-01', profile: null, logs: [], lastAttendance: null, ...over,
})
const kinds = (f: MemberPushFacts, today: string) => dueForMember(f, today).map(d => d.kind)

describe('expiring', () => {
  it('fires exactly 3 and 1 day before the latest end date, across month and year ends', () => {
    const d3 = dueForMember(base({ latestEnd: '2027-01-02' }), '2026-12-30')
    expect(d3).toHaveLength(1)
    expect(d3[0]).toMatchObject({ kind: 'expiring', ref: '2027-01-02-d3', body: PUSH_COPY.expiring(3), url: '/m/membership/renew' })
    const d1 = dueForMember(base({ latestEnd: '2026-03-01' }), '2026-02-28')
    expect(d1[0]).toMatchObject({ kind: 'expiring', ref: '2026-03-01-d1', body: PUSH_COPY.expiring(1) })
  })
  it('not on 2 days, 0 days, expired, or no membership', () => {
    expect(kinds(base({ latestEnd: '2026-11-12' }), '2026-11-10')).not.toContain('expiring')
    expect(kinds(base({ latestEnd: '2026-11-10' }), '2026-11-10')).not.toContain('expiring')
    expect(kinds(base({ latestEnd: '2026-11-07' }), '2026-11-10')).toEqual([])
    expect(kinds(base({ latestEnd: null }), '2026-11-10')).toEqual([])
  })
})

describe('body progress', () => {
  const profile = { goal: 'lose_fat' as const, heightCm: 170, targetWeightKg: null, targetDate: null }
  it('needs a body profile', () => {
    expect(kinds(base(), '2026-11-10')).toEqual([])
  })
  it('weigh_in due after 7 days with ISO week ref; measurements due with month ref', () => {
    const f = base({ profile, logs: [log('2026-11-03', 80, 90)] })
    const out = dueForMember(f, '2026-11-10')
    expect(out.find(d => d.kind === 'weigh_in')).toMatchObject({ ref: '2026W46', url: '/m/progress/body' })
    expect(out.find(d => d.kind === 'measurements')).toBeUndefined()
    const m = dueForMember(base({ profile, logs: [log('2026-10-01', 80, 90), log('2026-11-08', 80)] }), '2026-11-10')
    expect(m.find(d => d.kind === 'measurements')).toMatchObject({ ref: '2026-11' })
    expect(m.find(d => d.kind === 'weigh_in')).toBeUndefined()
  })
  it('nothing when logged today', () => {
    expect(kinds(base({ profile, logs: [log('2026-11-10', 80, 90)] }), '2026-11-10')).toEqual([])
  })
  it('goal near exactly 7 days before target date, and reached by buildPlan', () => {
    const p = { ...profile, targetWeightKg: 70, targetDate: '2026-11-17' }
    const near = dueForMember(base({ profile: p, logs: [log('2026-11-09', 78, 90)] }), '2026-11-10')
    expect(near.find(d => d.kind === 'goal')).toMatchObject({ ref: 'near-2026-11-17', body: PUSH_COPY.goalDateNear })
    const six = dueForMember(base({ profile: { ...p, targetDate: '2026-11-16' }, logs: [log('2026-11-09', 78, 90)] }), '2026-11-10')
    expect(six.find(d => d.kind === 'goal')).toBeUndefined()
    const reached = dueForMember(base({ profile: { ...p, targetDate: '2027-02-01' }, logs: [log('2026-09-01', 80), log('2026-11-09', 69.5, 90)] }), '2026-11-10')
    expect(reached.find(d => d.kind === 'goal')).toMatchObject({ ref: 'reached-2027-02-01', body: PUSH_COPY.goalReached })
  })
  it('stay_fit target never counts as reached', () => {
    const p = { goal: 'stay_fit' as const, heightCm: 170, targetWeightKg: 70, targetDate: '2027-02-01' }
    expect(kinds(base({ profile: p, logs: [log('2026-11-09', 60, 90)] }), '2026-11-10')).not.toContain('goal')
  })
})

describe('miss_you', () => {
  it('3+ days since last attendance, active membership only', () => {
    const out = dueForMember(base({ lastAttendance: '2026-11-07' }), '2026-11-10')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'miss_you', url: '/m/attendance' })
    expect(out[0].ref).toBe(`b${missYouBucket('2026-11-10')}`)
    expect(kinds(base({ lastAttendance: '2026-11-08' }), '2026-11-10')).toEqual([])
    expect(kinds(base({ lastAttendance: '2026-11-01', latestEnd: '2026-11-05' }), '2026-11-10')).toEqual([])
  })
  it('never attended is skipped; works across the year end', () => {
    expect(kinds(base({ lastAttendance: null }), '2026-11-10')).toEqual([])
    expect(kinds(base({ lastAttendance: '2026-12-29' }), '2027-01-01')).toEqual(['miss_you'])
  })
  it('bucket is stable inside 5 days and changes after', () => {
    expect(missYouBucket('2026-11-15')).toBe(missYouBucket('2026-11-10') + 1)
    const days = Array.from({ length: 5 }, (_, i) => missYouBucket(`2026-11-${String(10 + i).padStart(2, '0')}`))
    expect(new Set(days).size).toBeLessThanOrEqual(2)  })
})

describe('weekly_quote', () => {
  it('Monday only (2026-11-02 is a Monday)', () => {
    expect(weekdayOf('2026-11-02')).toBe(1)
    const out = dueForMember(base(), '2026-11-02')
    expect(out).toEqual([expect.objectContaining({ kind: 'weekly_quote', ref: '2026W45', url: '/m/home', body: quoteForDate('2026-11-02') })])
    expect(kinds(base(), '2026-11-03')).toEqual([])
    expect(kinds(base({ latestEnd: '2026-10-01' }), '2026-11-02')).toEqual([])
  })
  it('ISO week labels at year boundaries', () => {
    expect(isoWeekOf('2026-12-31')).toBe('2026W53')
    expect(isoWeekOf('2027-01-01')).toBe('2026W53')
    expect(isoWeekOf('2027-01-04')).toBe('2027W01')
    expect(isoWeekOf('2024-12-30')).toBe('2025W01')
  })
  it('agrees with istIsoWeek in cap.ts', () => {
    for (const d of ['2026-11-02', '2026-12-31', '2027-01-04', '2026-03-01']) {
      expect(isoWeekOf(d)).toBe(istIsoWeek(new Date(`${d}T06:00:00Z`)))
    }
  })
})

describe('IST vs UTC around midnight', () => {
  it('Monday starts on Sunday 18:30 UTC', () => {
    const sunUtc = new Date('2026-11-01T19:00:00Z') // 00:30 IST Monday
    expect(istToday(sunUtc)).toBe('2026-11-02')
    expect(weekdayOf(istToday(sunUtc))).toBe(1)
    const monUtcLate = new Date('2026-11-02T19:00:00Z') // Tuesday 00:30 IST
    expect(weekdayOf(istToday(monUtcLate))).toBe(2)
  })
})

describe('groupIntoJobs', () => {
  const d = (memberId: string, ref = 'r', body = 'b'): DuePush => ({ memberId, kind: 'expiring', ref, body, url: '/m/home' })
  it('groups same kind/ref/body into one job', () => {
    const jobs = groupIntoJobs('g', [d('b'), d('a'), d('c', 'other')])
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({ gymId: 'g', ref: 'r', memberIds: ['a', 'b'] })
  })
  it('chunks at 200 with distinct refs', () => {
    const jobs = groupIntoJobs('g', Array.from({ length: 450 }, (_, i) => d(`m${String(i).padStart(3, '0')}`)))
    expect(jobs.map(j => j.memberIds!.length)).toEqual([200, 200, 50])
    expect(jobs.map(j => j.ref)).toEqual(['r', 'r.c1', 'r.c2'])
  })
})
