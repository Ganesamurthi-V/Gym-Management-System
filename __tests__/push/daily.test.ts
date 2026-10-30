import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
const publish = vi.fn(async (_job: unknown) => {})
vi.mock('@/lib/push/publish', () => ({ publishPushJob: (j: unknown) => publish(j) }))
const history = vi.fn()
vi.mock('@/lib/push/cap', async () => {
  const actual = await vi.importActual<typeof import('@/lib/push/cap')>('@/lib/push/cap')
  return { ...actual, readPushHistory: (...a: unknown[]) => history(...a) }
})

import { runDailyPushStep } from '@/lib/push/daily'

type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
        gte: (c: string, v: string) => { filters.push(r => String(r[c]) >= v); return q },
        order: () => q,
        range: async (from: number, to: number) => ({
          data: (tables[table] ?? []).filter(r => filters.every(f => f(r))).slice(from, to + 1), error: null,
        }),
      }
      return q
    },
  } as never
}

// 2026-11-02 is a Monday. 09:00 IST = 03:30 UTC.
const NOW = new Date('2026-11-02T03:30:00Z')
const G = 'g1'
const mk = (n: number) => `m${n}`
const subs = (ids: string[]) => ids.map((m, i) => ({ id: `s${i}`, gym_id: G, member_id: m }))
const member = (id: string, extra: Row = {}) => ({ id, gym_id: G, last_portal_login: null, ...extra })
const ship = (id: string, end: string) => ({ id: `ms-${id}`, gym_id: G, member_id: id, end_date: end })
const tables = (ids: string[], ends: Record<string, string>, extra: Record<string, Row[]> = {}) => ({
  member_push_subscriptions: subs(ids),
  members: ids.map(i => member(i)),
  memberships: ids.map(i => ship(i, ends[i] ?? '2099-01-01')),
  attendance: [], member_body_profile: [], member_body_logs: [], ...extra,
})

beforeEach(() => {
  publish.mockClear()
  history.mockReset()
  history.mockImplementation(async (ids: string[]) => Object.fromEntries(ids.map(i => [i, { today: 0, week: 0 }])))
})

describe('runDailyPushStep', () => {
  it('groups Monday quote members into a single job', async () => {
    const ids = [mk(1), mk(2), mk(3)]
    const r = await runDailyPushStep(NOW, { db: fakeDb(tables(ids, {})) })
    expect(r).toEqual({ considered: 3, queued: 3 })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0]).toMatchObject({ gymId: G, kind: 'weekly_quote', ref: '2026W45', memberIds: ids, url: '/m/home' })
  })

  it('applies the cap: expiring beats the quote, one push per member per day', async () => {
    const r = await runDailyPushStep(NOW, { db: fakeDb(tables([mk(1), mk(2)], { [mk(1)]: '2026-11-05' })) })
    expect(r.considered).toBe(3)
    expect(r.queued).toBe(2)
    const jobs = publish.mock.calls.map(c => c[0] as { kind: string; memberIds: string[] })
    expect(jobs.find(j => j.kind === 'expiring')?.memberIds).toEqual([mk(1)])
    expect(jobs.find(j => j.kind === 'weekly_quote')?.memberIds).toEqual([mk(2)])
  })

  it('a member who already hit the daily cap gets nothing', async () => {
    history.mockImplementation(async (ids: string[]) => Object.fromEntries(ids.map(i => [i, { today: 1, week: 1 }])))
    expect(await runDailyPushStep(NOW, { db: fakeDb(tables([mk(1)], {})) })).toEqual({ considered: 1, queued: 0 })
    expect(publish).not.toHaveBeenCalled()
  })

  it('null history (no Redis) publishes nothing', async () => {
    history.mockResolvedValue(null)
    expect(await runDailyPushStep(NOW, { db: fakeDb(tables([mk(1)], {})) })).toEqual({ considered: 1, queued: 0 })
    expect(publish).not.toHaveBeenCalled()
  })

  it('nothing due: no publish and no history read', async () => {
    const tue = new Date('2026-11-03T03:30:00Z')
    expect(await runDailyPushStep(tue, { db: fakeDb(tables([mk(1)], {})) })).toEqual({ considered: 0, queued: 0 })
    expect(publish).not.toHaveBeenCalled()
    expect(history).not.toHaveBeenCalled()
  })

  it('skips members who opened the app today (IST)', async () => {
    const t = tables([mk(1)], {})
    t.members = [member(mk(1), { last_portal_login: '2026-11-02T01:00:00Z' })]
    expect(await runDailyPushStep(NOW, { db: fakeDb(t) })).toEqual({ considered: 0, queued: 0 })
  })

  it('outside the 07:00-21:00 IST window nothing is queued', async () => {
    const late = new Date('2026-11-02T17:00:00Z') // 22:30 IST Monday
    expect((await runDailyPushStep(late, { db: fakeDb(tables([mk(1)], {})) })).queued).toBe(0)
    expect(publish).not.toHaveBeenCalled()
  })

  it('never throws on a database error', async () => {
    const db = { from: () => { throw new Error('boom') } } as never
    await expect(runDailyPushStep(NOW, { db })).resolves.toEqual({ considered: 0, queued: 0 })
  })
})
