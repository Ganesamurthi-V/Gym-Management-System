import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/api/withAuth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    apiError: (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status }),
    apiSuccess: (data: unknown) => NextResponse.json({ success: true, data }),
  }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/push/config', () => ({ isPushConfigured: () => true }))
vi.mock('@/lib/push/daily', () => ({ loadSubscribersByGym: vi.fn(async () => new Map()), capAndPublish: vi.fn(async () => 0) }))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/cron/push-evening/route'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/cron/push-evening', { method: 'POST', headers })

describe('POST /api/cron/push-evening', () => {
  const env = { ...process.env }
  beforeEach(() => { process.env.CRON_SECRET = 'secret'; delete process.env.PUSH_EVENING_ENABLED })
  afterEach(() => { process.env = { ...env }; vi.useRealTimers() })

  it('401 without a secret or signature', async () => {
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req({ 'x-cron-secret': 'wrong' }))).status).toBe(401)
  })

  it('skipped when the flag is off', async () => {
    const res = await POST(req({ 'x-cron-secret': 'secret' }))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ skipped: true })
  })

  it('skipped outside 17:00-20:30 IST even when enabled', async () => {
    process.env.PUSH_EVENING_ENABLED = 'true'
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T03:30:00Z')) // 09:00 IST
    const res = await POST(req({ 'x-cron-secret': 'secret' }))
    expect((await res.json()).data).toMatchObject({ skipped: true, reason: 'outside_window' })
  })

  it('runs inside the window', async () => {
    process.env.PUSH_EVENING_ENABLED = 'true'
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T13:30:00Z')) // 19:00 IST
    const res = await POST(req({ 'x-cron-secret': 'secret' }))
    expect((await res.json()).data).toEqual({ considered: 0, queued: 0 })
  })
})
