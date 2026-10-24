/**
 * Failure alerts raised by the WhatsApp send queue (lib/whatsapp/queue.ts): QStash publish
 * classification, the daily publish counter, drain-not-rescheduled and permanent send failures.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  alert: vi.fn(async (_a?: any) => {}),
  incr: vi.fn(),
  expire: vi.fn(async () => 1),
}))

vi.mock('@/lib/monitoring/alert', () => ({ reportAlert: h.alert, reportAlertInBackground: h.alert }))
vi.mock('@/lib/redis', () => ({ redis: { incr: h.incr, expire: h.expire } }))
vi.mock('@/lib/whatsapp/recipientLimit', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp/recipientLimit')>()),
  reserveRecipient: async () => ({ allowed: true, isNew: true }),
  releaseRecipient: async () => {},
}))

import { kickDrain, drainSendQueue, QSTASH_BUDGET_WARN_AT } from '@/lib/whatsapp/queue'
import type { TemplateId, SendResult } from '@/types/whatsapp'

const keys = () => h.alert.mock.calls.map((c: any[]) => c[0].key)

beforeEach(() => {
  h.alert.mockClear()
  h.incr.mockReset().mockResolvedValue(1)
  h.expire.mockClear()
  process.env.QSTASH_TOKEN = 'tok'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
  process.env.UPSTASH_REDIS_REST_URL = 'https://r.example.com'
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'rt')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const stubFetch = (status: number) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status })))

describe('kickDrain alert classification', () => {
  it.each([
    [429, 'wa:qstash_quota'],
    [401, 'wa:qstash_auth'],
    [403, 'wa:qstash_auth'],
    [404, 'wa:qstash_auth'],
    [500, 'wa:qstash_publish'],
  ])('HTTP %i -> %s, still returns false', async (status, key) => {
    stubFetch(status)
    expect(await kickDrain()).toBe(false)
    expect(keys()).toEqual([key])
    expect(h.alert.mock.calls[0][0].severity).toBe('critical')
    expect(h.incr).not.toHaveBeenCalled()
  })

  it('network error -> wa:qstash_publish, returns false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    expect(await kickDrain()).toBe(false)
    expect(keys()).toEqual(['wa:qstash_publish'])
  })

  it('not configured -> wa:qstash_publish, returns false', async () => {
    delete process.env.QSTASH_TOKEN
    expect(await kickDrain()).toBe(false)
    expect(keys()).toEqual(['wa:qstash_publish'])
  })
})

describe('QStash daily publish counter', () => {
  it('counts a successful publish under a UTC-day key with a 2 day expiry, no alert below 800', async () => {
    stubFetch(200)
    h.incr.mockResolvedValue(799)
    expect(await kickDrain()).toBe(true)
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    expect(h.incr).toHaveBeenCalledWith(`qstash:publishes:${day}`)
    expect(h.expire).toHaveBeenCalledWith(`qstash:publishes:${day}`, 172800)
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('warns when the count reaches 800', async () => {
    stubFetch(200)
    h.incr.mockResolvedValue(QSTASH_BUDGET_WARN_AT)
    expect(await kickDrain()).toBe(true)
    expect(keys()).toEqual(['wa:qstash_budget'])
    expect(h.alert.mock.calls[0][0].severity).toBe('warning')
  })

  it('never throws when Redis fails, and skips Redis when unconfigured', async () => {
    stubFetch(200)
    h.incr.mockRejectedValue(new Error('redis down'))
    expect(await kickDrain()).toBe(true)
    h.incr.mockClear()
    delete process.env.UPSTASH_REDIS_REST_URL
    expect(await kickDrain()).toBe(true)
    expect(h.incr).not.toHaveBeenCalled()
  })
})

function makeClient(queue: any[]) {
  const builder = () => {
    const filters: Array<(r: any) => boolean> = []
    let mode: 'select' | 'update' = 'select'
    let patch: any = null
    let head = false
    let single = false
    let max = Infinity
    const q: any = {
      select: (_c?: string, o?: any) => { head = !!o?.head; return q },
      update: (p: any) => { mode = 'update'; patch = p; return q },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
      in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
      lte: (c: string, v: string) => { filters.push(r => r[c] != null && r[c] <= v); return q },
      order: () => q,
      limit: (n: number) => { max = n; return q },
      maybeSingle: () => { single = true; return q },
      then: (resolve: (v: any) => void) => {
        const rows = queue.filter(r => filters.every(f => f(r))).slice(0, max)
        if (mode === 'update') {
          rows.forEach(r => Object.assign(r, patch))
          return resolve({ data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null })
        }
        if (head) return resolve({ count: rows.length })
        resolve({ data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null })
      },
    }
    return q
  }
  return { from: builder } as any
}

const row = (attempts: number) => ({
  id: '00000000-0000-4000-8000-000000000001', gym_id: 'g', member_id: 'm1',
  template_name: 'payment_due_reminder' as TemplateId,
  context: { phone: '9876543210', gymName: 'G', memberName: 'A', gymId: 'g' },
  log_row_id: null, attempts, max_attempts: 3, status: 'pending', locked_at: null,
  scheduled_at: new Date(Date.now() - 1000).toISOString(),
})
const tokens = { takeToken: async () => ({ success: true, remaining: 99 }) }

describe('drainSendQueue alerts', () => {
  it('raises wa:drain_not_rescheduled (critical) when work remains and the reschedule fails', async () => {
    const sender = vi.fn(async (): Promise<SendResult> => ({ success: false, error: 'boom' }))
    const stats = await drainSendQueue({ supabase: makeClient([row(0)]), sender, ...tokens, reschedule: async () => false })
    expect(stats.remaining).toBe(1)
    expect(stats.rescheduled).toBe(false)
    expect(keys()).toEqual(['wa:drain_not_rescheduled'])
    expect(h.alert.mock.calls[0][0].severity).toBe('critical')
    expect(h.alert.mock.calls[0][0].body).toContain('1 message')
  })

  it('does not raise it when the reschedule succeeds', async () => {
    const sender = vi.fn(async (): Promise<SendResult> => ({ success: false, error: 'boom' }))
    await drainSendQueue({ supabase: makeClient([row(0)]), sender, ...tokens, reschedule: async () => true })
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('raises wa:send_failed with the error class and no phone number when rows fail for good', async () => {
    const sender = vi.fn(async (): Promise<SendResult> => ({ success: false, httpStatus: 400, error: 'invalid recipient 919876543210' }))
    const stats = await drainSendQueue({ supabase: makeClient([row(2)]), sender, ...tokens, reschedule: async () => true })
    expect(stats.failed).toBe(1)
    expect(keys()).toEqual(['wa:send_failed'])
    const body = h.alert.mock.calls[0][0].body as string
    expect(body).toContain('1 message')
    expect(body).toContain('invalid recipient')
    expect(body).not.toMatch(/9198\d+|9876543210/)
  })
})
