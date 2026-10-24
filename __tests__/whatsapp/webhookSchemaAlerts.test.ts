/**
 * Real current Meta payload shapes (fake ids/numbers): contacts without profile, statuses with
 * pricing + recipient_user_id, 'unsupported' messages without `from`, and non-message fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as crypto from 'crypto'

const h = vi.hoisted(() => ({
  alertBg: vi.fn(),
  saveLog: vi.fn(async () => {}),
  processMessages: vi.fn(async () => {}),
  processStatuses: vi.fn(async () => {}),
  saveIncoming: vi.fn(async () => {}),
  updateStatus: vi.fn(async () => {}),
  messageExists: vi.fn(async () => false),
  incr: vi.fn(async () => 1),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlert: vi.fn(async () => {}), reportAlertInBackground: h.alertBg }))
vi.mock('@/lib/redis', () => ({ redis: { incr: h.incr, expire: vi.fn(async () => 1) } }))
vi.mock('@/repositories/whatsapp/whatsappRepository', () => ({
  saveWebhookLog: h.saveLog,
  saveIncomingMessage: h.saveIncoming,
  updateMessageStatus: h.updateStatus,
  messageExists: h.messageExists,
  getGymIdFromPhoneNumber: vi.fn(async () => 'gym-1'),
}))
vi.mock('@/lib/whatsapp/idempotency', () => ({ checkAndMarkEvent: vi.fn(async () => true) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/whatsapp/queue', () => ({ confirmQueuedSend: vi.fn(async () => ({ updated: false })) }))
vi.mock('@/services/whatsapp/messageProcessor', () => ({ processMessages: h.processMessages }))
vi.mock('@/services/whatsapp/statusProcessor', () => ({ processStatuses: h.processStatuses }))
vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: any) => fn({ setTag() {}, setExtra() {} }), captureException: vi.fn(), captureMessage: vi.fn(),
}))

import { POST } from '@/app/api/whatsapp/webhook/route'
import { webhookPayloadSchema } from '@/lib/whatsapp/webhookSchemas'
import { parseMessages, parseStatuses, extractContactName } from '@/lib/whatsapp/parseWebhook'

const SECRET = 'test_app_secret_32_characters_long_123456'
const log: any = { start: vi.fn(), end: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

const wrap = (value: any, field = 'messages') => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba-1', changes: [{ field, value }] }],
})
const meta = { display_phone_number: '15550000000', phone_number_id: 'pn-1' }
const base = { messaging_product: 'whatsapp', metadata: meta }

const deliveredStatus = {
  id: 'wamid.AAA', status: 'delivered', timestamp: '1700000000',
  recipient_id: '919800000000', recipient_user_id: 'IN.9620000000000',
  biz_opaque_callback_data: '00000000-0000-4000-8000-000000000001',
  pricing: { type: 'regular', billable: true, category: 'utility', pricing_model: 'PMP' },
}
const failedStatus = {
  id: 'wamid.BBB', status: 'failed', timestamp: '1700000000', recipient_id: '919800000000',
  errors: [{ code: 131026, title: 'Message undeliverable', message: 'Message undeliverable',
    error_data: { details: 'Message Undeliverable.' }, href: 'https://developers.facebook.com/docs/x' }],
}
const unsupportedMsg = {
  from_user_id: 'IN.9620000000000', id: 'wamid.CCC', timestamp: '1700000000', type: 'unsupported',
  unsupported: { type: 'unknown' }, errors: [{ code: 131051, title: 'Message type is not currently supported' }],
}

beforeEach(() => {
  Object.values(h).forEach(f => (f as any).mockClear?.())
  process.env.WHATSAPP_APP_SECRET = SECRET
  delete process.env.UPSTASH_REDIS_REST_URL
})

describe('current Meta shapes validate and parse', () => {
  it('delivered status with pricing, recipient_user_id and biz_opaque_callback_data', () => {
    const p = webhookPayloadSchema.parse(wrap({ ...base, statuses: [deliveredStatus] }))
    const [s] = parseStatuses(p as any)
    expect(s.status).toBe('delivered')
    expect(s.bizOpaqueData).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('failed status with errors (title, message, error_data, href)', () => {
    const p = webhookPayloadSchema.parse(wrap({ ...base, statuses: [failedStatus] }))
    const [s] = parseStatuses(p as any)
    expect(s.errorCode).toBe(131026)
    expect(s.errorMessage).toBe('Message undeliverable')
  })

  it('status without recipient_id still parses', () => {
    const { recipient_id, ...rest } = failedStatus
    const [s] = parseStatuses(webhookPayloadSchema.parse(wrap({ ...base, statuses: [rest] })) as any)
    expect(s.recipientId).toBeUndefined()
  })

  it('contacts without profile (user_id only, or wa_id only) validate and do not throw', () => {
    for (const contacts of [[{ user_id: 'IN.9620000000000', wa_id: '919800000000' }], [{ wa_id: '919800000000' }], [{ user_id: 'IN.1' }]]) {
      const p = webhookPayloadSchema.parse(wrap({ ...base, contacts, messages: [unsupportedMsg] }))
      expect(extractContactName(p as any)).toEqual({})
    }
    const named = webhookPayloadSchema.parse(wrap({ ...base, contacts: [{ wa_id: '91980', profile: { name: 'Asha' } }] }))
    expect(extractContactName(named as any)).toEqual({ '91980': 'Asha' })
  })

  it('unsupported message with from_user_id validates and parses as unknown', () => {
    const p = webhookPayloadSchema.parse(wrap({ ...base, messages: [unsupportedMsg] }))
    const [m] = parseMessages(p as any)
    expect(m.type).toBe('unknown')
    expect(m.from).toBe('')
  })

  it('garbage is still rejected', () => {
    expect(webhookPayloadSchema.safeParse({ object: 'page', entry: [] }).success).toBe(false)
    expect(webhookPayloadSchema.safeParse(wrap({ metadata: meta })).success).toBe(false) // no messaging_product
    expect(webhookPayloadSchema.safeParse(wrap({ ...base, statuses: [{ id: 'x', status: 'bogus', timestamp: '1' }] })).success).toBe(false)
  })
})

describe('message processing without a sender', () => {
  it('skips a message with no from, warns, and does not throw', async () => {
    const actual = await vi.importActual<typeof import('@/services/whatsapp/messageProcessor')>('@/services/whatsapp/messageProcessor')
    const [m] = parseMessages(webhookPayloadSchema.parse(wrap({ ...base, messages: [unsupportedMsg] })) as any)
    await expect(actual.processMessages([m], {}, log)).resolves.toBeUndefined()
    expect(h.saveIncoming).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })
})

describe('processing real statuses', () => {
  it('delivered status (no failed handling) updates the message row', async () => {
    const actual = await vi.importActual<typeof import('@/services/whatsapp/statusProcessor')>('@/services/whatsapp/statusProcessor')
    const [s] = parseStatuses(webhookPayloadSchema.parse(wrap({ ...base, statuses: [deliveredStatus] })) as any)
    await actual.processStatuses([s], log)
    expect(h.updateStatus).toHaveBeenCalledTimes(1)
  })
})

function signed(body: unknown) {
  const raw = JSON.stringify(body)
  const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex')
  return new NextRequest('http://localhost/api/whatsapp/webhook', {
    method: 'POST', body: raw, headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' },
  })
}
const flush = () => new Promise(r => setTimeout(r, 0))

describe('webhook route', () => {
  it.each(['account_update', 'message_template_status_update', 'phone_number_name_update', 'some_future_field'])(
    'acknowledges %s with 200, logs processed=true, runs no processors', async (field) => {
      const res = await POST(signed(wrap({ event: 'X', anything: { nested: true } }, field)))
      expect(res.status).toBe(200)
      expect(h.processMessages).not.toHaveBeenCalled()
      expect(h.processStatuses).not.toHaveBeenCalled()
      const args = h.saveLog.mock.calls[0] as any[]
      expect(args[2]).toBe('unknown') // event_type is CHECK-constrained
      expect(args[5]).toBe(true)      // processed
      expect(args[6]).toBe(`ignored field: ${field}`)
      expect(h.alertBg).not.toHaveBeenCalled()
    })

  it('processes a current messages event (200)', async () => {
    const res = await POST(signed(wrap({ ...base, contacts: [{ user_id: 'IN.1' }], statuses: [deliveredStatus] })))
    expect(res.status).toBe(200)
    expect(h.processStatuses).toHaveBeenCalledTimes(1)
  })

  it('processes the messages change and ignores the others in a mixed payload', async () => {
    const body = wrap({ ...base, statuses: [deliveredStatus] })
    body.entry[0].changes.push({ field: 'account_update', value: { event: 'X' } } as any)
    expect((await POST(signed(body))).status).toBe(200)
    expect(h.processStatuses).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['wrong object', { object: 'page', entry: [] }, 'object'],
    ['missing entry', { object: 'whatsapp_business_account' }, 'entry'],
    ['bad messages value', wrap({ metadata: meta }), 'messaging_product'],
  ])('rejects malformed payload (%s) with 400 and a diagnostic', async (_n, body, needle) => {
    const res = await POST(signed(body))
    expect(res.status).toBe(400)
    const args = h.saveLog.mock.calls[0] as any[]
    expect(args[5]).toBe(false)
    expect(args[6]).toMatch(/^Schema validation failed: /)
    expect(args[6]).toContain(needle)
    expect(args[6].length).toBeLessThanOrEqual(500)
  })

  it('invalid signature still returns 401', async () => {
    const req = new NextRequest('http://localhost/api/whatsapp/webhook', {
      method: 'POST', body: '{}', headers: { 'x-hub-signature-256': 'sha256=bad' },
    })
    expect((await POST(req)).status).toBe(401)
    expect(h.saveLog).not.toHaveBeenCalled()
  })

  it('alerts wa:webhook_schema_invalid from the 5th failure in an hour, without values', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://r.example.com'
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'rt')
    h.incr.mockResolvedValue(5)
    await POST(signed({ object: 'whatsapp_business_account', entry: 'secret-value' }))
    await flush()
    const a = h.alertBg.mock.calls[0][0]
    expect(a).toMatchObject({ key: 'wa:webhook_schema_invalid', severity: 'warning' })
    expect(a.body).toContain('entry')
    expect(a.body).not.toContain('secret-value')
  })
})
