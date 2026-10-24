/**
 * Meta 'failed' delivery statuses: persisted as delivery_failed and alerted by error class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  alert: vi.fn(async (_a?: any) => {}),
  incr: vi.fn(),
  expire: vi.fn(async () => 1),
  updates: [] as Array<{ table: string; patch: any; filters: Array<[string, any]> }>,
  rows: {} as Record<string, any[]>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlert: h.alert, reportAlertInBackground: h.alert }))
vi.mock('@/lib/redis', () => ({ redis: { incr: h.incr, expire: h.expire } }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const rec: any = { table, patch: null, filters: [] as Array<[string, any]> }
      h.updates.push(rec)
      const q: any = {
        update: (p: any) => { rec.patch = p; return q },
        eq: (c: string, v: any) => { rec.filters.push([c, v]); return q },
        in: (c: string, v: any) => { rec.filters.push([c, v]); return q },
        or: (expr: string) => { rec.filters.push(['or', expr]); return q },
        then: (res: (v: any) => void) => {
          // Stateful rows (optional): apply the recorded filters so guards are really exercised.
          const rows = h.rows[table] ?? []
          for (const r of rows) {
            const ok = rec.filters.every(([c, v]: [string, any]) => {
              if (c === 'or') return v.split(',').some((p: string) => {
                const m = p.match(/^(\w+)\.(is\.null|eq\.\"(.*)\")$/)!
                return m[2] === 'is.null' ? r[m[1]] == null : r[m[1]] === m[3]
              })
              return Array.isArray(v) ? v.includes(r[c]) : r[c] === v
            })
            if (ok && rec.patch) Object.assign(r, rec.patch)
          }
          res({ error: null })
        },
      }
      return q
    },
  }),
}))
vi.mock('@/lib/whatsapp/queue', () => ({ confirmQueuedSend: vi.fn() }))
vi.mock('@/lib/whatsapp/idempotency', () => ({ checkAndMarkEvent: vi.fn(async () => true) }))
vi.mock('@/repositories/whatsapp/whatsappRepository', () => ({ updateMessageStatus: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import { processStatuses, classifyMetaError } from '@/services/whatsapp/statusProcessor'

const log: any = { start: vi.fn(), end: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const QUEUE_ID = '00000000-0000-4000-8000-000000000001'
const failed = (errorCode: number, errorMessage = 'x') => ({
  messageId: 'wamid.1', status: 'failed', recipientId: '919876543210', timestamp: new Date(),
  bizOpaqueData: QUEUE_ID, errorCode, errorMessage,
}) as any
const flush = () => new Promise(r => setTimeout(r, 0))
const keys = () => h.alert.mock.calls.map((c: any[]) => c[0].key)

beforeEach(() => {
  h.alert.mockClear()
  vi.mocked(Sentry.captureMessage).mockClear()
  h.expire.mockClear()
  h.updates.length = 0
  h.rows = {}
  h.incr.mockReset().mockResolvedValue(1)
  process.env.UPSTASH_REDIS_REST_URL = 'https://r.example.com'
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'rt')
})

describe('failed delivery status', () => {
  it('marks the queue row and the automation log delivery_failed with Meta code and title', async () => {
    await processStatuses([failed(131026, 'Message undeliverable')], log)
    const q = h.updates.find(u => u.table === 'whatsapp_send_queue')!
    const l = h.updates.find(u => u.table === 'whatsapp_automation_logs')!
    expect(q.patch).toEqual({ status: 'delivery_failed', last_error: 'Meta 131026: Message undeliverable' })
    expect(q.filters).toContainEqual(['id', QUEUE_ID])
    expect(l.patch).toEqual({ status: 'delivery_failed', error_message: 'Meta 131026: Message undeliverable' })
    expect(l.filters).toContainEqual(['message_id', 'wamid.1'])
    expect(l.filters).toContainEqual(['status', 'sent'])
  })

  it('an old-attempt failed webhook does not flip a row whose current message_id differs', async () => {
    h.rows = { whatsapp_send_queue: [{ id: QUEUE_ID, status: 'sent', message_id: 'wamid.NEW' }] }
    await processStatuses([failed(131026, 'Message undeliverable')], log) // wamid.1 = earlier attempt
    expect(h.rows.whatsapp_send_queue[0].status).toBe('sent')
  })

  it('flips the row when its message_id matches or is still unset', async () => {
    h.rows = { whatsapp_send_queue: [{ id: QUEUE_ID, status: 'sent', message_id: 'wamid.1' }] }
    await processStatuses([failed(131026)], log)
    expect(h.rows.whatsapp_send_queue[0].status).toBe('delivery_failed')
    h.rows = { whatsapp_send_queue: [{ id: QUEUE_ID, status: 'sending', message_id: null }] }
    await processStatuses([failed(131026)], log)
    expect(h.rows.whatsapp_send_queue[0].status).toBe('delivery_failed')
  })

  it('a replayed old failed status is persisted but never alerts or counts', async () => {
    const old = { ...failed(190, 'Access token expired'), timestamp: new Date(Date.now() - 3 * 3600_000) }
    await processStatuses([old], log)
    await flush()
    expect(h.updates.some(u => u.table === 'whatsapp_automation_logs')).toBe(true)
    expect(h.alert).not.toHaveBeenCalled()
    expect(h.incr).not.toHaveBeenCalled()
  })

  it('190 -> critical wa:token_invalid', async () => {
    await processStatuses([failed(190, 'Access token expired')], log)
    expect(keys()).toEqual(['wa:token_invalid'])
    expect(h.alert.mock.calls[0][0].severity).toBe('critical')
  })

  it('131030 is silent (counted only)', async () => {
    await processStatuses([failed(131030, 'Recipient not in allowed list')], log)
    await flush()
    expect(h.alert).not.toHaveBeenCalled()
    expect(h.incr).toHaveBeenCalledTimes(1)
  })

  it.each([131026, 131030])('%i is a recipient failure: no Sentry event, counted only', async (code) => {
    await processStatuses([failed(code)], log)
    await flush()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
    expect(h.alert).not.toHaveBeenCalled()
    expect(h.incr).toHaveBeenCalledTimes(1)
  })

  it('an unknown failure code still reaches Sentry', async () => {
    await processStatuses([failed(999999, 'weird')], log)
    expect(Sentry.captureMessage).toHaveBeenCalledWith('WhatsApp message delivery failed', expect.anything())
  })

  it.each([131048, 130429])('%i -> critical wa:meta_rate_limited', async (code) => {
    await processStatuses([failed(code)], log)
    expect(keys()).toEqual(['wa:meta_rate_limited'])
    expect(h.alert.mock.calls[0][0].severity).toBe('critical')
  })

  it('unknown code -> warning wa:delivery_failed carrying the code but not the phone', async () => {
    await processStatuses([failed(999999, 'weird')], log)
    expect(keys()).toEqual(['wa:delivery_failed'])
    const a = h.alert.mock.calls[0][0]
    expect(a.severity).toBe('warning')
    expect(a.body).toContain('999999')
    expect(JSON.stringify(a)).not.toContain('9198')
  })

  it('raises wa:delivery_failure_rate when the hourly count reaches 10', async () => {
    h.incr.mockResolvedValue(9)
    await processStatuses([failed(131030)], log)
    await flush()
    expect(h.alert).not.toHaveBeenCalled()
    h.incr.mockResolvedValue(10)
    await processStatuses([failed(131030)], log)
    await flush()
    expect(keys()).toEqual(['wa:delivery_failure_rate'])
    expect(h.expire).toHaveBeenCalledWith(expect.stringMatching(/^wa:delivery_failures:\d{10}$/), 7200)
  })

  it('still alerts when Redis is unconfigured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    await processStatuses([failed(190)], log)
    expect(keys()).toEqual(['wa:token_invalid'])
    expect(h.incr).not.toHaveBeenCalled()
  })
})

describe('classifyMetaError', () => {
  it('maps codes and messages', () => {
    expect(classifyMetaError(401, undefined)).toBe('token')
    expect(classifyMetaError(1, 'Invalid OAuth access token')).toBe('token')
    expect(classifyMetaError(131026, '')).toBe('recipient')
    expect(classifyMetaError(130429, '')).toBe('rate_limit')
    expect(classifyMetaError(131048, '')).toBe('rate_limit')
    expect(classifyMetaError(131056, '')).toBe('recipient') // per-recipient pair limit, not global
    expect(classifyMetaError(undefined, undefined)).toBe('other')
  })
})
