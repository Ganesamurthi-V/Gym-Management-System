/**
 * Webhook alerts: hourly bad-signature counter and processing errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as crypto from 'crypto'

const h = vi.hoisted(() => ({
  alertBg: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(async () => 1),
  processStatuses: vi.fn(),
}))

vi.mock('@/lib/monitoring/alert', () => ({ reportAlert: vi.fn(async () => {}), reportAlertInBackground: h.alertBg }))
vi.mock('@/lib/redis', () => ({ redis: { incr: h.incr, expire: h.expire } }))
vi.mock('@/repositories/whatsapp/whatsappRepository', () => ({ saveWebhookLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/whatsapp/messageProcessor', () => ({ processMessages: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/whatsapp/statusProcessor', () => ({ processStatuses: h.processStatuses }))
vi.mock('@sentry/nextjs', () => ({ withScope: (fn: any) => fn({ setTag() {}, setExtra() {} }), captureException: vi.fn() }))

import { POST } from '@/app/api/whatsapp/webhook/route'

const SECRET = 'test_app_secret_32_characters_long_123456'
beforeEach(() => {
  h.alertBg.mockClear()
  h.incr.mockReset()
  h.expire.mockClear()
  h.processStatuses.mockReset().mockResolvedValue(undefined)
  process.env.WHATSAPP_APP_SECRET = SECRET
  process.env.UPSTASH_REDIS_REST_URL = 'https://r.example.com'
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'rt')
})

const flush = () => new Promise(r => setTimeout(r, 0))
const badReq = () => new NextRequest('http://localhost/api/whatsapp/webhook', {
  method: 'POST', body: '{}', headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
})

describe('webhook bad signature counter', () => {
  it('counts per UTC hour with 2 h expiry and alerts only from the 5th failure', async () => {
    for (let n = 1; n <= 4; n++) {
      h.incr.mockResolvedValueOnce(n)
      expect((await POST(badReq())).status).toBe(401)
      await flush()
    }
    expect(h.alertBg).not.toHaveBeenCalled()
    h.incr.mockResolvedValueOnce(5)
    expect((await POST(badReq())).status).toBe(401)
    await flush()
    expect(h.alertBg).toHaveBeenCalledTimes(1)
    expect(h.alertBg.mock.calls[0][0]).toMatchObject({ key: 'wa:webhook_bad_signature', severity: 'warning' })
    expect(h.incr).toHaveBeenCalledWith(expect.stringMatching(/^wa:webhook:badsig:\d{10}$/))
    expect(h.expire).toHaveBeenCalledWith(expect.stringMatching(/^wa:webhook:badsig:\d{10}$/), 7200)
  })

  it('does not wait for Redis before answering 401', async () => {
    h.incr.mockReturnValue(new Promise(() => {})) // never resolves
    expect((await POST(badReq())).status).toBe(401)
  })

  it('still answers 401 without Redis', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    expect((await POST(badReq())).status).toBe(401)
    expect(h.alertBg).not.toHaveBeenCalled()
  })
})

describe('webhook processing error', () => {
  it('alerts wa:webhook_error with the event type and returns 500', async () => {
    h.processStatuses.mockRejectedValue(new Error('db exploded'))
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'e', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '1', phone_number_id: '2' },
        statuses: [{ id: 'wamid.1', status: 'sent', timestamp: '1700000000', recipient_id: '919876543210' }],
      } }] }],
    })
    const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex')
    const res = await POST(new NextRequest('http://localhost/api/whatsapp/webhook', {
      method: 'POST', body, headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(500)
    expect(h.alertBg.mock.calls[0][0]).toMatchObject({ key: 'wa:webhook_error', severity: 'warning' })
    expect(h.alertBg.mock.calls[0][0].body).toContain('status')
  })
})
