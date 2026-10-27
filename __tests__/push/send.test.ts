import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/push/config', () => ({ configureWebPush: () => true }))
vi.mock('@/lib/push/cap', () => ({ recordPush: vi.fn(async () => {}) }))
vi.mock('@/lib/member/trialEligibility', () => ({ getTrialEligibleMemberIds: vi.fn(async () => new Set(['m1'])) }))
const send = vi.fn()
const redisSet = vi.fn()
vi.mock('@/lib/redis', () => ({ redis: { set: (...a: unknown[]) => redisSet(...a), del: vi.fn() } }))
vi.mock('web-push', () => ({ default: { sendNotification: (...a: unknown[]) => send(...a) } }))

import { sendPushToMembers } from '@/lib/push/send'
import { recordPush } from '@/lib/push/cap'

type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number }
const GOOD = 'https://fcm.googleapis.com/fcm/send/'
const PAID_GYM = { name: 'Iron Gym', plan_type: 'pro', is_active: true, subscription_status: 'active', subscription_ends_at: '2099-01-01T00:00:00Z', trial_ends_at: null }

function fakeDb(subs: Sub[], gym: Record<string, unknown> | null = PAID_GYM) {
  const deleted: string[] = []
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const seen: { memberIds?: string[]; gymId?: string } = {}
  const db = {
    from(table: string) {
      if (table === 'gyms') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: gym, error: null }) }) }) }
      }
      const f: { memberIds?: string[]; cursor?: string } = {}
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (_c: string, v: string) => { seen.gymId = v; return q },
        in: (_c: string, v: string[]) => { f.memberIds = v; seen.memberIds = v; return q },
        gt: (_c: string, v: string) => { f.cursor = v; return q },
        order: () => q,
        limit: async (n: number) => {
          let rows = subs.filter(s => !deleted.includes(s.id))
          if (f.memberIds) rows = rows.filter(s => f.memberIds!.includes(s.member_id))
          if (f.cursor) rows = rows.filter(s => s.member_id > f.cursor!)
          rows = [...rows].sort((a, b) => a.member_id.localeCompare(b.member_id) || a.id.localeCompare(b.id))
          return { data: rows.slice(0, n), error: null }
        },
        delete: () => ({ eq: async (_c: string, id: string) => { deleted.push(id); return { error: null } } }),
        update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { updates.push({ id, patch }); return { error: null } } }),
      }
      return q
    },
  }
  return { db: db as never, deleted, updates, seen }
}

const sub = (id: string, member: string, endpoint = GOOD + id, failure_count = 0): Sub => ({ id, member_id: member, endpoint, p256dh: 'p', auth: 'a', failure_count })
const job = { gymId: 'g1', kind: 'notice' as const, ref: 'n1', body: 'Closed Sunday', url: '/m/notifications' }

beforeEach(() => {
  send.mockReset()
  vi.mocked(recordPush).mockClear()
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})

describe('sendPushToMembers', () => {
  it('sends the payload with TTL and normal urgency and resets failure_count', async () => {
    send.mockResolvedValue({})
    const { db, updates } = fakeDb([sub('s1', 'm1', GOOD + 's1', 2)])
    const r = await sendPushToMembers(job, { db })
    expect(r).toMatchObject({ sent: 1, removed: 0, failed: 0 })
    const [target, body, options] = send.mock.calls[0]
    expect(target.endpoint).toBe(GOOD + 's1')
    expect(JSON.parse(body)).toEqual({ title: 'Iron Gym', body: 'Closed Sunday', url: '/m/notifications', tag: 'notice' })
    expect(options).toMatchObject({ TTL: 86400, urgency: 'normal' })
    expect(updates[0].patch).toMatchObject({ failure_count: 0 })
    expect(recordPush).toHaveBeenCalledWith('m1', 'notice')
  })

  it('deletes the subscription on 404 and 410', async () => {
    send.mockRejectedValueOnce({ statusCode: 410 }).mockRejectedValueOnce({ statusCode: 404 })
    const { db, deleted } = fakeDb([sub('s1', 'm1'), sub('s2', 'm2')])
    const r = await sendPushToMembers(job, { db })
    expect([...deleted].sort()).toEqual(['s1', 's2'])
    expect(r).toMatchObject({ sent: 0, removed: 2, failed: 0 })
  })

  it('counts other failures and deletes at the limit', async () => {
    send.mockRejectedValue({ statusCode: 500 })
    const { db, deleted, updates } = fakeDb([sub('s1', 'm1', GOOD + 's1', 1), sub('s2', 'm2', GOOD + 's2', 4)])
    const r = await sendPushToMembers(job, { db })
    expect(updates).toEqual([{ id: 's1', patch: { failure_count: 2 } }])
    expect(deleted).toEqual(['s2'])
    expect(r).toMatchObject({ sent: 0, failed: 2, removed: 1 })
  })

  it('re-validates the endpoint before sending and removes a bad one', async () => {
    send.mockResolvedValue({})
    const { db, deleted } = fakeDb([sub('s1', 'm1', 'https://169.254.169.254/x'), sub('s2', 'm2')])
    const r = await sendPushToMembers(job, { db })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].endpoint).toBe(GOOD + 's2')
    expect(deleted).toEqual(['s1'])
    expect(r.removed).toBe(1)
  })

  it('scopes the query by gym and member ids', async () => {
    send.mockResolvedValue({})
    const { db, seen } = fakeDb([sub('s1', 'm1'), sub('s2', 'm2')])
    await sendPushToMembers({ ...job, memberIds: ['m2'] }, { db })
    expect(seen).toMatchObject({ gymId: 'g1', memberIds: ['m2'] })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('dedupes per member with SET NX when Redis is configured', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'y'
    redisSet.mockReset().mockImplementation(async (key: string) => (key.endsWith(':m1') ? 'OK' : null))
    send.mockResolvedValue({})
    const { db } = fakeDb([sub('s1', 'm1'), sub('s2', 'm2')])
    const r = await sendPushToMembers(job, { db })
    expect(redisSet).toHaveBeenCalledWith('push:notice:n1:m1', '1', { nx: true, ex: 172800 })
    expect(r.sent).toBe(1)
  })

  it('stops at the time budget and returns a cursor', async () => {
    send.mockResolvedValue({})
    const subs = Array.from({ length: 25 }, (_, i) => sub(`s${i}`, `m${String(i).padStart(2, '0')}`))
    const { db } = fakeDb(subs)
    let calls = 0
    // The budget is spent after the first chunk of 10 members.
    const now = () => (++calls >= 4 ? 1e9 : 0)
    const r = await sendPushToMembers(job, { db, budgetMs: 1000, now })
    expect(r.sent).toBe(10)
    expect(r.nextCursor).toBe('m09')
  })

  it('sends nothing for a Free-plan or deactivated gym', async () => {
    const free = fakeDb([sub('s1', 'm1')], { ...PAID_GYM, plan_type: 'free' })
    expect((await sendPushToMembers(job, { db: free.db })).sent).toBe(0)
    const off = fakeDb([sub('s1', 'm1')], { ...PAID_GYM, is_active: false })
    expect((await sendPushToMembers(job, { db: off.db })).sent).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('on a trial only reaches the eligible members', async () => {
    send.mockResolvedValue({})
    const { db } = fakeDb([sub('s1', 'm1'), sub('s2', 'm2')], { ...PAID_GYM, plan_type: 'trial', subscription_status: 'trial', trial_ends_at: '2099-01-01T00:00:00Z', subscription_ends_at: null })
    const r = await sendPushToMembers(job, { db })
    expect(r.sent).toBe(1)
    expect(send.mock.calls[0][0].endpoint).toBe(GOOD + 's1')
  })
})
