/**
 * Meta's 250 unique customers / rolling 24 h limit. The SQL function is mirrored by an
 * in-memory fake, so these tests pin the contract the TypeScript relies on; nothing here calls
 * Meta or a database.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ client: null as any }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))

import { reserveRecipient, releaseRecipient, estimateDrainMinutes, normalisePhone } from '@/lib/whatsapp/recipientLimit'
import { sendTemplate } from '@/services/whatsapp/graph'
import { drainSendQueue, BATCH_SIZE, DRAIN_INTERVAL_MINUTES } from '@/lib/whatsapp/queue'
import { finalizeSendRow } from '@/lib/whatsapp/finalize'
import type { SendResult, TemplateContext, TemplateId } from '@/types/whatsapp'

const DAY = 24 * 3600_000

/** Mirror of public.reserve_whatsapp_recipient / release_whatsapp_recipient. */
function makeWindow(opts: { fail?: boolean } = {}) {
  let now = Date.now()
  const rows = new Map<string, number>()
  const calls: string[] = []
  const client = {
    rpc: async (fn: string, args: any) => {
      calls.push(fn)
      if (opts.fail) return { data: null, error: { message: 'function does not exist' } }
      if (fn === 'reserve_whatsapp_recipient') {
        for (const [p, t] of rows) if (t < now - DAY) rows.delete(p)
        if (rows.has(args.p_phone)) return { data: { allowed: true, is_new: false }, error: null }
        if (rows.size >= args.p_limit) {
          const oldest = Math.min(...rows.values())
          return { data: { allowed: false, retry_at: new Date(oldest + DAY).toISOString(), in_window: rows.size }, error: null }
        }
        rows.set(args.p_phone, now)
        return { data: { allowed: true, is_new: true }, error: null }
      }
      if (fn === 'release_whatsapp_recipient') { rows.delete(args.p_phone); return { data: null, error: null } }
      return { data: null, error: { message: 'unknown rpc' } }
    },
  }
  return { client: client as any, rows, calls, advance: (ms: number) => { now += ms } }
}

const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const ctx = (phone: string, over: Partial<TemplateContext> = {}): TemplateContext => ({
  phone, gymName: 'Iron Temple', memberName: 'Arjun', dueAmount: 2000, ...over,
})

beforeEach(() => {
  process.env.WHATSAPP_BASE_URL = 'http://graph.test'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok'
})
afterEach(() => { vi.unstubAllGlobals(); h.client = null })

describe('reserveRecipient', () => {
  it('counts the same phone once, whatever its format', async () => {
    const w = makeWindow()
    expect(await reserveRecipient('9876543210', { client: w.client, cap: 1 })).toEqual({ allowed: true, isNew: true })
    expect(await reserveRecipient('+91 98765 43210', { client: w.client, cap: 1 })).toEqual({ allowed: true, isNew: false })
    expect(w.rows.size).toBe(1)
    expect([...w.rows.keys()]).toEqual(['919876543210'])
  })

  it('denies a new phone at the cap with retryAt = oldest first message + 24h, and frees it after expiry', async () => {
    const w = makeWindow()
    await reserveRecipient('9000000001', { client: w.client, cap: 2 })
    w.advance(3600_000)
    await reserveRecipient('9000000002', { client: w.client, cap: 2 })
    const denied = await reserveRecipient('9000000003', { client: w.client, cap: 2 })
    expect(denied.allowed).toBe(false)
    const first = [...w.rows.values()][0]
    if (!denied.allowed) expect(denied.retryAt.getTime()).toBe(first + DAY)
    // An existing recipient is still allowed at the cap.
    expect(await reserveRecipient('9000000001', { client: w.client, cap: 2 })).toMatchObject({ allowed: true, isNew: false })
    w.advance(DAY - 3600_000 + 1)
    expect(await reserveRecipient('9000000003', { client: w.client, cap: 2 })).toMatchObject({ allowed: true, isNew: true })
  })

  it('fails closed with a short retryAt when the RPC errors or is missing', async () => {
    const w = makeWindow({ fail: true })
    const r = await reserveRecipient('9876543210', { client: w.client })
    expect(r.allowed).toBe(false)
    if (!r.allowed) {
      const ms = r.retryAt.getTime() - Date.now()
      expect(ms).toBeGreaterThan(60_000)
      expect(ms).toBeLessThanOrEqual(2 * 60_000)
    }
  })

  it('normalisePhone keeps a 10-digit number starting with 91', () => {
    expect(normalisePhone('9198765432')).toBe('919198765432')
    expect(normalisePhone('919198765432')).toBe('919198765432')
  })
})

describe('sendTemplate and the window', () => {
  it('defers BEFORE calling Meta when the limit is reached', async () => {
    const w = makeWindow(); h.client = w.client
    await reserveRecipient('9000000001', { client: w.client, cap: 1 })
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const res = await sendTemplate('payment_due_reminder', ctx('9000000002', { recipientCap: 1 }))
    expect(res).toMatchObject({ success: false, deferred: true, error: 'WhatsApp daily recipient limit reached' })
    expect(typeof res.retryAt).toBe('string')
    expect(f).not.toHaveBeenCalled()
  })

  it('does not reserve a slot when validation fails', async () => {
    const w = makeWindow(); h.client = w.client
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const res = await sendTemplate('payment_due_reminder', ctx('9000000002', { memberName: '' }))
    expect(res.success).toBe(false)
    expect(res.deferred).toBeFalsy()
    expect(w.calls).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })

  it('releases a slot it created on a definite 4xx, but not one that already existed', async () => {
    const w = makeWindow(); h.client = w.client
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(400, { error: { message: 'bad number', code: 131026 } })))
    await sendTemplate('payment_due_reminder', ctx('9000000001'))
    expect(w.rows.size).toBe(0)

    await reserveRecipient('9000000002', { client: w.client })
    await sendTemplate('payment_due_reminder', ctx('9000000002'))
    expect(w.rows.size).toBe(1)
  })

  it('keeps the slot on an ambiguous outcome and on success', async () => {
    const w = makeWindow(); h.client = w.client
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    const amb = await sendTemplate('payment_due_reminder', ctx('9000000001'))
    expect(amb.ambiguous).toBe(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(200, { messages: [{ id: 'wamid.1' }] })))
    await sendTemplate('payment_due_reminder', ctx('9000000002'))
    expect(w.rows.size).toBe(2)
  })

  it('an inline send may use the queue reserve; the queue cap may not', async () => {
    const w = makeWindow(); h.client = w.client
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(200, { messages: [{ id: 'wamid.1' }] })))
    await reserveRecipient('9000000001', { client: w.client, cap: 3 })
    await reserveRecipient('9000000002', { client: w.client, cap: 3 })
    // Queue cap of 2 is full; the full limit of 3 still has a slot.
    expect(await sendTemplate('payment_due_reminder', ctx('9000000003', { recipientCap: 2 }))).toMatchObject({ deferred: true })
    process.env.WHATSAPP_DAILY_RECIPIENT_LIMIT = '3'
    const inline = await reserveRecipient('9000000003', { client: w.client, cap: 3 })
    expect(inline).toMatchObject({ allowed: true, isNew: true })
    delete process.env.WHATSAPP_DAILY_RECIPIENT_LIMIT
  })
})

// ─── queue ────────────────────────────────────────────────────────────────────

function makeQueue(queue: any[]) {
  const builder = () => {
    const filters: Array<(r: any) => boolean> = []
    let mode: 'select' | 'update' = 'select'
    let patch: any = null
    let head = false
    let single = false
    const q: any = {
      select: (_c?: string, o?: any) => { head = !!o?.head; return q },
      update: (p: any) => { mode = 'update'; patch = p; return q },
      insert: () => q,
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
      in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
      lte: (c: string, v: string) => { filters.push(r => r[c] != null && r[c] <= v); return q },
      order: () => q, limit: () => q,
      maybeSingle: () => { single = true; return q },
      then: (resolve: (v: any) => void) => {
        const rows = queue.filter(r => filters.every(f => f(r)))
        if (mode === 'update') {
          rows.forEach(r => Object.assign(r, patch))
          return resolve({ data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null })
        }
        if (head) return resolve({ count: rows.length })
        // Copies, like PostgREST: the drain must not see its own later writes through the row.
        resolve({ data: single ? (rows[0] ? { ...rows[0] } : null) : rows.map(r => ({ ...r })), error: null })
      },
    }
    return q
  }
  return { from: builder } as any
}

const qrow = (id: string, phone: string): any => ({
  id, gym_id: null, member_id: `m-${id}`, template_name: 'payment_due_reminder' as TemplateId,
  context: { phone, gymName: 'Iron Temple', memberName: 'Arjun', dueAmount: 2000 },
  log_row_id: null, attempts: 0, max_attempts: 3, status: 'pending', locked_at: null,
  scheduled_at: new Date(Date.now() - 1000).toISOString(),
})
const deps = { takeToken: async () => ({ success: true, remaining: 100 }) }

describe('drainSendQueue with the recipient limit', () => {
  it('defers the row to retryAt without an attempt, a failure or a retry, and stops the run', async () => {
    const w = makeWindow(); h.client = w.client
    const first = Date.now() - 2 * 3600_000
    w.rows.set('919000000001', first)
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const queue = [qrow('r1', '9000000002'), qrow('r2', '9000000003')]
    const reschedule = vi.fn(async () => true)
    const stats = await drainSendQueue({
      supabase: makeQueue(queue), reschedule, ...deps,
      sender: (t, c) => sendTemplate(t, { ...c, recipientCap: 1 }),
    })
    expect(f).not.toHaveBeenCalled()
    expect(stats).toMatchObject({ deferred: 1, failed: 0, retried: 0, sent: 0, drained: 1 })
    expect(queue[0]).toMatchObject({ status: 'pending', attempts: 0, locked_at: null, last_error: 'deferred: daily recipient limit' })
    expect(queue[0].scheduled_at).toBe(new Date(first + DAY).toISOString())
    expect(queue[1]).toMatchObject({ status: 'pending', attempts: 0 })
    // Hours away: re-check hourly, never later.
    expect(reschedule).toHaveBeenCalledWith(60)
  })

  it('still sends a second row for a phone that already has a slot when the cap is reached', async () => {
    const w = makeWindow(); h.client = w.client
    w.rows.set('919000000001', Date.now())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(200, { messages: [{ id: 'wamid.1' }] })))
    const queue = [qrow('r1', '9000000001')]
    const sender = (t: TemplateId, c: TemplateContext) => sendTemplate(t, { ...c, recipientCap: 1 })
    const stats = await drainSendQueue({ supabase: makeQueue(queue), reschedule: async () => false, ...deps, sender })
    expect(stats.sent).toBe(1)
    expect(queue[0].status).toBe('sent')
  })

  it('passes the queue cap (LIMIT - RESERVE) to the sender', async () => {
    const queue = [qrow('r1', '9000000001')]
    const sender = vi.fn(async (): Promise<SendResult> => ({ success: true, messageId: 'x' }))
    await drainSendQueue({ supabase: makeQueue(queue), reschedule: async () => false, ...deps, sender })
    expect((sender.mock.calls[0] as any)[1].recipientCap).toBe(220)
  })
})

describe('finalizeSendRow', () => {
  it('releases the slot (status error) on a deferred result', async () => {
    const patches: any[] = []
    const db: any = { from: () => ({ update: (p: any) => { patches.push(p); return { eq: async () => ({ error: null }) } } }) }
    await finalizeSendRow(db, 'log-1', { success: false, deferred: true, error: 'x' })
    expect(patches[0]).toEqual({ status: 'error', error_message: 'daily recipient limit' })
  })
})

describe('estimateDrainMinutes', () => {
  const base = { cap: 220, batchSize: BATCH_SIZE, intervalMinutes: DRAIN_INTERVAL_MINUTES }
  it('keeps the rate-based estimate when everything fits', () => {
    expect(estimateDrainMinutes({ ...base, queued: 30, unique: 30, free: 220 })).toBe(5)
  })
  it('adds whole days for recipients beyond the free slots', () => {
    expect(estimateDrainMinutes({ ...base, queued: 300, unique: 300, free: 220 })).toBe(3 * 5 + 1440)
    expect(estimateDrainMinutes({ ...base, queued: 600, unique: 600, free: 100 })).toBe(6 * 5 + 3 * 1440)
  })
  it('treats negative free as zero and zero queued as zero', () => {
    expect(estimateDrainMinutes({ ...base, queued: 15, unique: 15, free: -5 })).toBe(5 + 1440)
    expect(estimateDrainMinutes({ ...base, queued: 0, unique: 0, free: 0 })).toBe(0)
  })
  it('releaseRecipient is exercised', async () => {
    const w = makeWindow()
    w.rows.set('919000000001', Date.now())
    await releaseRecipient('9000000001', w.client)
    expect(w.rows.size).toBe(0)
  })
})
