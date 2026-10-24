/**
 * Drain route: bogus QStash signatures are counted per UTC hour and only alert (warning) at 5+.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ alertBg: vi.fn(), incr: vi.fn(), expire: vi.fn(async () => 1) }))

vi.mock('@/lib/monitoring/alert', () => ({ reportAlert: vi.fn(async () => {}), reportAlertInBackground: h.alertBg }))
vi.mock('@/lib/redis', () => ({ redis: { incr: h.incr, expire: h.expire } }))
vi.mock('@/lib/whatsapp/queue', () => ({ drainSendQueue: vi.fn() }))

import { POST } from '@/app/api/whatsapp/queue/drain/route'

const flush = () => new Promise(r => setTimeout(r, 0))
const bad = () => new NextRequest('http://localhost/api/whatsapp/queue/drain', {
  method: 'POST', body: '{}', headers: { 'upstash-signature': 'x' },
})

beforeEach(() => {
  h.alertBg.mockClear()
  h.incr.mockReset()
  process.env.CRON_SECRET = 's3cret'
  process.env.UPSTASH_REDIS_REST_URL = 'https://r.example.com'
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'rt')
})

describe('drain bad signature', () => {
  it('401s without waiting for Redis', async () => {
    h.incr.mockReturnValue(new Promise(() => {}))
    expect((await POST(bad())).status).toBe(401)
  })

  it('alerts a WARNING only from the 5th bad signature in the hour', async () => {
    h.incr.mockResolvedValueOnce(4)
    await POST(bad()); await flush()
    expect(h.alertBg).not.toHaveBeenCalled()
    h.incr.mockResolvedValueOnce(5)
    await POST(bad()); await flush()
    expect(h.alertBg.mock.calls[0][0]).toMatchObject({ key: 'wa:drain_unauthorized', severity: 'warning' })
    expect(h.incr).toHaveBeenCalledWith(expect.stringMatching(/^wa:drain:badsig:\d{10}$/))
  })

  it('no header -> no counting, no alert', async () => {
    const r = new NextRequest('http://localhost/api/whatsapp/queue/drain', { method: 'POST', body: '{}' })
    expect((await POST(r)).status).toBe(401)
    await flush()
    expect(h.incr).not.toHaveBeenCalled()
  })
})
