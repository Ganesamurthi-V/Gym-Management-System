/**
 * Exactly-once outbound sends: a stable id per send, no blind resend when the outcome is
 * unknown, and resolution by webhook confirmation or lease expiry. Mocks only; nothing here
 * calls Meta or a database.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// The recipient-window RPC needs a database; these tests are about the send path, so slots are always granted.
vi.mock('@/lib/whatsapp/recipientLimit', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp/recipientLimit')>()),
  reserveRecipient: async () => ({ allowed: true, isNew: true }),
  releaseRecipient: async () => {},
}))
import { fetchJson } from '@/lib/fetch'
import { sendMessage, sendTemplate } from '@/services/whatsapp/graph'
import { drainSendQueue, confirmQueuedSend, LEASE_MINUTES } from '@/lib/whatsapp/queue'
import { finalizeSendRow } from '@/lib/whatsapp/finalize'
import type { TemplateId, TemplateContext, SendResult } from '@/types/whatsapp'

// ─── fetch helpers ────────────────────────────────────────────────────────────

const jsonRes = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

describe('fetchJson retryAmbiguous', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('does not retry a network error when retryAmbiguous is false', async () => {
    const f = vi.fn().mockRejectedValue(new Error('socket hang up'))
    vi.stubGlobal('fetch', f)
    await expect(fetchJson('http://x', { retryAmbiguous: false })).rejects.toThrow(/failed after 1 attempts/)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 503 when retryAmbiguous is false', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes(503, {}))
    vi.stubGlobal('fetch', f)
    await expect(fetchJson('http://x', { retryAmbiguous: false })).rejects.toThrow('HTTP 503')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('still retries a 429 when retryAmbiguous is false', async () => {
    vi.useFakeTimers()
    const f = vi.fn()
      .mockResolvedValueOnce(jsonRes(429, {}))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    const p = fetchJson('http://x', { retryAmbiguous: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect((await p).data).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('retries a 503 by default', async () => {
    vi.useFakeTimers()
    const f = vi.fn()
      .mockResolvedValueOnce(jsonRes(503, {}))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    const p = fetchJson('http://x')
    await vi.advanceTimersByTimeAsync(1000)
    expect((await p).data).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
  })
})

describe('sendMessage / sendTemplate', () => {
  beforeEach(() => {
    process.env.WHATSAPP_BASE_URL = 'http://graph.test'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('maps a timeout to ambiguous and a 400 to a definite failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    const timedOut = await sendMessage({ a: 1 })
    expect(timedOut).toMatchObject({ success: false, ambiguous: true })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(400, { error: { message: 'bad number', code: 131026 } })))
    const rejected = await sendMessage({ a: 1 })
    expect(rejected.success).toBe(false)
    expect(rejected.ambiguous).toBeFalsy()
  })

  it('sends dedupeKey as biz_opaque_callback_data and still validates', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes(200, { messages: [{ id: 'wamid.1' }] }))
    vi.stubGlobal('fetch', f)
    const res = await sendTemplate('payment_due_reminder', {
      phone: '9876543210', gymName: 'Iron Temple', memberName: 'Arjun', dueAmount: 2000, dedupeKey: 'row-id-1',
    })
    expect(res).toMatchObject({ success: true, messageId: 'wamid.1' })
    const sent = JSON.parse(f.mock.calls[0][1].body)
    expect(sent.biz_opaque_callback_data).toBe('row-id-1')
  })
})

// ─── in-memory whatsapp_send_queue ────────────────────────────────────────────

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'

function makeClient(queue: any[], extra?: { logs?: any[] }) {
  const failWrite = { when: (_p: any) => false }
  const builder = (table: string) => {
    const filters: Array<(r: any) => boolean> = []
    let mode: 'select' | 'update' = 'select'
    let patch: any = null
    let head = false
    let single = false
    const store = table === 'whatsapp_automation_logs' ? (extra?.logs ?? []) : queue
    const q: any = {
      select: (_c?: string, o?: any) => { head = !!o?.head; return q },
      update: (p: any) => { mode = 'update'; patch = p; return q },
      insert: () => q,
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
      in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
      lte: (c: string, v: string) => { filters.push(r => r[c] != null && r[c] <= v); return q },
      order: () => q,
      limit: () => q,
      maybeSingle: () => { single = true; return q },
      then: (resolve: (v: any) => void) => {
        const rows = store.filter(r => filters.every(f => f(r)))
        if (mode === 'update') {
          if (failWrite.when(patch)) return resolve({ data: null, error: { message: 'db down' } })
          rows.forEach(r => Object.assign(r, patch))
          return resolve({ data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null })
        }
        if (head) return resolve({ count: rows.length })
        resolve({ data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null })
      },
    }
    return q
  }
  return { client: { from: builder } as any, failWrite }
}

const qrow = (id: string, over: any = {}): any => ({
  id, gym_id: 'gym-1', member_id: 'mem-1', template_name: 'payment_due_reminder' as TemplateId,
  context: { phone: '9876543210', gymName: 'Iron Temple', memberName: 'Arjun', gymId: 'gym-1' },
  log_row_id: null, attempts: 0, max_attempts: 3, status: 'pending', locked_at: null,
  scheduled_at: new Date(Date.now() - 1000).toISOString(), ...over,
})

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const deps = { takeToken: async () => ({ success: true, remaining: 100 }), reschedule: async () => false }
const okSender = () => vi.fn(async (_t: TemplateId, _c: TemplateContext): Promise<SendResult> => ({ success: true, messageId: 'wamid.1' }))

describe('drainSendQueue: unknown outcomes', () => {
  it('leaves an ambiguous send in sending: not requeued, not failed, sender called once', async () => {
    const queue = [qrow(ID1)]
    const sender = vi.fn(async (): Promise<SendResult> => ({ success: false, error: 'timeout', ambiguous: true }))
    const stats = await drainSendQueue({ supabase: makeClient(queue).client, sender, ...deps })
    expect(sender).toHaveBeenCalledTimes(1)
    expect(queue[0].status).toBe('sending')
    expect(queue[0].locked_at).not.toBeNull()
    expect(queue[0].last_error).toBe('unconfirmed: timeout')
    expect(stats).toMatchObject({ unconfirmed: 1, retried: 0, failed: 0 })
  })

  it('retries persisting sent: ok after two errors, left sending if it always errors', async () => {
    const queue = [qrow(ID1)]
    const fake = makeClient(queue)
    let errs = 0
    fake.failWrite.when = p => p.status === 'sent' && errs++ < 2
    await drainSendQueue({ supabase: fake.client, sender: okSender(), ...deps })
    expect(queue[0].status).toBe('sent')
    expect(queue[0].message_id).toBe('wamid.1')

    const queue2 = [qrow(ID2)]
    const fake2 = makeClient(queue2)
    fake2.failWrite.when = p => p.status === 'sent'
    await drainSendQueue({ supabase: fake2.client, sender: okSender(), ...deps })
    expect(queue2[0].status).toBe('sending')
  })
})

describe('reaper', () => {
  it('requeues a stale sending row and sends it once; leaves a fresh one; fails an exhausted one', async () => {
    const queue = [
      qrow(ID1, { status: 'sending', locked_at: minutesAgo(LEASE_MINUTES + 1), attempts: 1 }),
      qrow(ID2, { status: 'sending', locked_at: minutesAgo(2), attempts: 1 }),
      qrow(ID3, { status: 'sending', locked_at: minutesAgo(LEASE_MINUTES + 1), attempts: 3 }),
    ]
    const sender = okSender()
    const stats = await drainSendQueue({ supabase: makeClient(queue).client, sender, ...deps })
    expect(stats.reaped).toBe(2)
    expect(sender).toHaveBeenCalledTimes(1)
    expect((sender.mock.calls[0] as any)[1].dedupeKey).toBe(ID1)
    expect(queue[0]).toMatchObject({ status: 'sent', attempts: 2 })
    expect(queue[1].status).toBe('sending')
    expect(queue[2]).toMatchObject({ status: 'failed', last_error: 'unconfirmed send; attempts exhausted' })
  })
})

describe('confirmQueuedSend', () => {
  it('marks a sending row sent, cancels a pending retry, is idempotent, ignores non-UUIDs', async () => {
    const queue = [qrow(ID1, { status: 'sending', locked_at: minutesAgo(1) }), qrow(ID2, { status: 'pending' })]
    const { client } = makeClient(queue)

    expect(await confirmQueuedSend(client, ID1, 'wamid.A')).toEqual({ updated: true })
    expect(queue[0]).toMatchObject({ status: 'sent', message_id: 'wamid.A', last_error: null })
    expect(await confirmQueuedSend(client, ID1, 'wamid.A')).toEqual({ updated: false })

    expect(await confirmQueuedSend(client, ID2, 'wamid.B')).toEqual({ updated: true })
    expect(queue[1].status).toBe('sent')

    expect(await confirmQueuedSend(client, 'not-a-uuid', 'wamid.C')).toEqual({ updated: false })
  })
})

describe('crash simulation', () => {
  it('webhook confirms after a lost DB write: no duplicate after the lease passes', async () => {
    const queue = [qrow(ID1)]
    const fake = makeClient(queue)
    const sender = okSender()
    fake.failWrite.when = p => p.status === 'sent'
    await drainSendQueue({ supabase: fake.client, sender, ...deps })
    expect(queue[0].status).toBe('sending')

    fake.failWrite.when = () => false
    await confirmQueuedSend(fake.client, ID1, 'wamid.1')
    queue[0].locked_at = minutesAgo(LEASE_MINUTES + 1) // lease long past; row is already sent
    await drainSendQueue({ supabase: fake.client, sender, ...deps })

    expect(queue[0].status).toBe('sent')
    expect(sender).toHaveBeenCalledTimes(1)
  })

  it('without a webhook the lease resends once, with the same dedupeKey (documented residual risk)', async () => {
    const queue = [qrow(ID1)]
    const fake = makeClient(queue)
    const sender = okSender()
    fake.failWrite.when = p => p.status === 'sent'
    await drainSendQueue({ supabase: fake.client, sender, ...deps })

    fake.failWrite.when = () => false
    queue[0].locked_at = minutesAgo(LEASE_MINUTES + 1)
    await drainSendQueue({ supabase: fake.client, sender, ...deps })

    expect(sender).toHaveBeenCalledTimes(2)
    expect((sender.mock.calls[0] as any)[1].dedupeKey).toBe(ID1)
    expect((sender.mock.calls[1] as any)[1].dedupeKey).toBe(ID1)
    expect(queue[0].status).toBe('sent')
  })
})

describe('finalizeSendRow', () => {
  it('keeps the log slot sent for an ambiguous result', async () => {
    const logs = [{ id: 'log-1', status: 'sent', error_message: null }]
    const { client } = makeClient([], { logs })
    await finalizeSendRow(client, 'log-1', { success: false, error: 'timeout', ambiguous: true })
    expect(logs[0].status).toBe('sent')
    expect(logs[0].error_message).toBe('unconfirmed: timeout')
  })
})
