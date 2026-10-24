import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

const reportAlert = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/monitoring/alert', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/monitoring/alert')>()),
  reportAlert,
}))

import { POST } from '@/app/api/sentry/webhook/route'

const SECRET = 'test-secret'
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex')

function req(body: object, resource: string, signature?: string) {
  const raw = JSON.stringify(body)
  const headers: Record<string, string> = { 'sentry-hook-resource': resource }
  headers['sentry-hook-signature'] = signature ?? sign(raw)
  return new NextRequest('http://localhost/api/sentry/webhook', { method: 'POST', body: raw, headers })
}

const eventAlert = {
  action: 'triggered',
  data: { triggered_rule: 'High error rate', event: { title: 'TypeError: x is undefined', web_url: 'https://sentry.io/e/1', level: 'error' } },
}

describe('POST /api/sentry/webhook', () => {
  beforeEach(() => { reportAlert.mockClear(); process.env.SENTRY_WEBHOOK_SECRET = SECRET })
  afterEach(() => { delete process.env.SENTRY_WEBHOOK_SECRET })

  it('forwards an event alert with a valid signature', async () => {
    const res = await POST(req(eventAlert, 'event_alert'))
    expect(res.status).toBe(200)
    expect(reportAlert).toHaveBeenCalledTimes(1)
    expect(reportAlert).toHaveBeenCalledWith(expect.objectContaining({
      key: 'sentry:event_alert', severity: 'critical', title: 'TypeError: x is undefined',
    }))
  })

  it('rejects a bad or missing signature with 401', async () => {
    expect((await POST(req(eventAlert, 'event_alert', sign('other')))).status).toBe(401)
    expect((await POST(req(eventAlert, 'event_alert', 'abcd'))).status).toBe(401)
    expect(reportAlert).not.toHaveBeenCalled()
  })

  it('returns 503 when the secret is not configured', async () => {
    delete process.env.SENTRY_WEBHOOK_SECRET
    expect((await POST(req(eventAlert, 'event_alert'))).status).toBe(503)
  })

  it('ignores resolved metric alerts and unknown resources', async () => {
    const resolved = await POST(req({ action: 'resolved', data: { description_title: 'x' } }, 'metric_alert'))
    expect(await resolved.json()).toEqual({ ok: true, ignored: true })
    const unknown = await POST(req({ action: 'created' }, 'installation'))
    expect(await unknown.json()).toEqual({ ok: true, ignored: true })
    expect(reportAlert).not.toHaveBeenCalled()
  })
})
