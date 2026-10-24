/**
 * Cron routes: failure alerts, and markCronOk only after a successful run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  alert: vi.fn(async (_a?: any) => {}),
  markOk: vi.fn(async () => {}),
  ping: vi.fn(async () => {}),
  run: vi.fn(),
  subResults: [] as Array<{ data: any; error: any }>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlert: h.alert, reportAlertInBackground: vi.fn() }))
vi.mock('@/lib/monitoring/cronStatus', () => ({ markCronOk: h.markOk }))
vi.mock('@/lib/monitoring/heartbeat', () => ({ pingHeartbeat: h.ping }))
vi.mock('@/lib/whatsapp/automation', () => ({ runDailyWhatsAppAutomation: h.run }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q: any = {
        update: () => q, eq: () => q, lt: () => q,
        select: () => Promise.resolve(h.subResults.shift() ?? { data: [], error: null }),
      }
      return q
    },
  }),
}))

import { POST as waCron } from '@/app/api/cron/whatsapp/route'
import { POST as subCron } from '@/app/api/cron/subscription/route'

const req = () => new NextRequest('http://localhost/api/cron/x', { method: 'POST', headers: { 'x-cron-secret': 's3cret' } })
const keys = () => h.alert.mock.calls.map((c: any[]) => c[0].key)

beforeEach(() => {
  h.alert.mockClear()
  h.markOk.mockClear()
  h.ping.mockClear()
  h.run.mockReset()
  h.subResults = []
  process.env.CRON_SECRET = 's3cret'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('whatsapp cron', () => {
  it('marks ok and pings only on success; no alert', async () => {
    h.run.mockResolvedValue({ queued: 1 })
    expect((await waCron(req())).status).toBe(200)
    expect(h.markOk).toHaveBeenCalledWith('whatsapp')
    expect(h.ping).toHaveBeenCalledTimes(1)
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('failure -> 500, critical cron:whatsapp:failed, no markCronOk', async () => {
    h.run.mockRejectedValue(new Error('kaput'))
    expect((await waCron(req())).status).toBe(500)
    expect(keys()).toEqual(['cron:whatsapp:failed'])
    expect(h.alert.mock.calls[0][0]).toMatchObject({ severity: 'critical', body: 'kaput' })
    expect(h.markOk).not.toHaveBeenCalled()
    expect(h.ping).not.toHaveBeenCalled()
  })

  it('missing CRON_SECRET -> 500 and cron:secret_missing', async () => {
    delete process.env.CRON_SECRET
    expect((await waCron(req())).status).toBe(500)
    expect(keys()).toEqual(['cron:secret_missing'])
  })
})

describe('subscription cron', () => {
  it('marks ok after both updates succeed', async () => {
    expect((await subCron(req())).status).toBe(200)
    expect(h.markOk).toHaveBeenCalledWith('subscription')
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('a failed update -> 500, cron:subscription:failed, no markCronOk', async () => {
    h.subResults = [{ data: null, error: { message: 'db down' } }]
    expect((await subCron(req())).status).toBe(500)
    expect(keys()).toEqual(['cron:subscription:failed'])
    expect(h.markOk).not.toHaveBeenCalled()
  })
})
