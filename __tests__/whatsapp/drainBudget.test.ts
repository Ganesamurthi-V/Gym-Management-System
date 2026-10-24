/**
 * Drain batch size (100 / 5 min), wall-clock budget, reschedule decisions and QStash dedup ids.
 * In-memory queue; no Meta, Redis or QStash.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
vi.mock('@/lib/whatsapp/recipientLimit', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp/recipientLimit')>()),
  reserveRecipient: async () => ({ allowed: true, isNew: true }),
  releaseRecipient: async () => {},
}))
import {
  drainSendQueue, kickDrain, drainDedupId,
  BATCH_SIZE, DRAIN_INTERVAL_MINUTES, DRAIN_TIME_BUDGET_MS, CONTINUATION_DELAY_MINUTES,
} from '@/lib/whatsapp/queue'
import type { TemplateId, SendResult } from '@/types/whatsapp'

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
      insert: () => q,
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

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, gym_id: 'g', member_id: `m${i}`,
  template_name: 'payment_due_reminder' as TemplateId,
  context: { phone: '9876543210', gymName: 'G', memberName: 'A', gymId: 'g' },
  log_row_id: null, attempts: 0, max_attempts: 3, status: 'pending', locked_at: null,
  scheduled_at: new Date(Date.now() - 1000).toISOString(),
}))
const ok = () => vi.fn(async (): Promise<SendResult> => ({ success: true, messageId: 'w' }))
const tokens = { takeToken: async () => ({ success: true, remaining: 999 }) }

describe('drain batch and reschedule', () => {
  it('constants', () => {
    expect(BATCH_SIZE).toBe(100)
    expect(DRAIN_INTERVAL_MINUTES).toBe(5)
    expect(DRAIN_TIME_BUDGET_MS).toBe(40_000)
  })

  it('120 pending: sends exactly 100 and reschedules at the interval', async () => {
    const queue = mk(120)
    const sender = ok(); const reschedule = vi.fn(async () => true)
    const stats = await drainSendQueue({ supabase: makeClient(queue), sender, reschedule, ...tokens })
    expect(stats.sent).toBe(100)
    expect(stats.remaining).toBe(20)
    expect(stats.timeBudgetHit).toBe(false)
    expect(reschedule).toHaveBeenCalledWith(DRAIN_INTERVAL_MINUTES)
  })

  it('time budget: stops early, leaves nothing sending, reschedules with the short delay', async () => {
    const queue = mk(50)
    const sender = ok(); const reschedule = vi.fn(async () => true)
    let t = 0
    // Clock jumps past the budget once 10 sends have gone out.
    const now = () => (sender.mock.calls.length >= 10 ? t + DRAIN_TIME_BUDGET_MS + 1 : t)
    const stats = await drainSendQueue({ supabase: makeClient(queue), sender, reschedule, now, ...tokens })
    expect(stats.sent).toBe(10)
    expect(stats.timeBudgetHit).toBe(true)
    expect(queue.filter(r => r.status === 'sending')).toHaveLength(0)
    expect(queue.filter(r => r.status === 'pending')).toHaveLength(40)
    expect(reschedule).toHaveBeenCalledTimes(1)
    expect(reschedule).toHaveBeenCalledWith(CONTINUATION_DELAY_MINUTES, { continuation: true })
    expect(CONTINUATION_DELAY_MINUTES).toBeLessThan(DRAIN_INTERVAL_MINUTES)
  })

  it('token exhaustion reschedules at the interval', async () => {
    const queue = mk(5)
    const reschedule = vi.fn(async () => true)
    const stats = await drainSendQueue({
      supabase: makeClient(queue), sender: ok(), reschedule,
      takeToken: async () => ({ success: false, remaining: 0 }),
    })
    expect(stats.sent).toBe(0)
    expect(reschedule).toHaveBeenCalledWith(DRAIN_INTERVAL_MINUTES)
  })

  it('empty queue does not reschedule', async () => {
    const reschedule = vi.fn(async () => true)
    const stats = await drainSendQueue({ supabase: makeClient([]), sender: ok(), reschedule, ...tokens })
    expect(stats.rescheduled).toBe(false)
    expect(reschedule).not.toHaveBeenCalled()
  })
})

describe('drain dedup ids', () => {
  const T = 10 * 5 * 60_000
  it('two continuation kicks in one window differ', () => {
    expect(drainDedupId(1, T + 1000, true)).not.toBe(drainDedupId(1, T + 61_000, true))
  })
  it('two normal kicks in one window share an id; delay is part of it', () => {
    expect(drainDedupId(5, T + 1000)).toBe(drainDedupId(5, T + 200_000))
    expect(drainDedupId(0, T + 1000)).not.toBe(drainDedupId(5, T + 1000))
  })
  describe('kickDrain headers', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
    it('sends a unique id and a 60s delay for continuation kicks', async () => {
      vi.stubEnv('QSTASH_TOKEN', 't'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://x.test')
      const f = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', f)
      await kickDrain(1, { continuation: true })
      await new Promise(r => setTimeout(r, 3))
      await kickDrain(1, { continuation: true })
      const h = f.mock.calls.map(c => c[1].headers)
      expect(h[0]['Upstash-Delay']).toBe('60s')
      expect(h[0]['Upstash-Deduplication-Id']).not.toBe(h[1]['Upstash-Deduplication-Id'])
    })
  })
})
