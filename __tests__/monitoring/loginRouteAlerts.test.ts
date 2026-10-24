import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({ alert: vi.fn(), logs: [] as unknown[][] }))

vi.mock('@upstash/redis', () => ({ Redis: class {} }))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class { static slidingWindow() { return {} } async limit() { return { success: true, reset: 0 } } },
}))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: (...a: unknown[]) => m.alert(...a) }))
vi.mock('@/lib/logger', () => ({
  logger: { error: (...a: unknown[]) => m.logs.push(a), warn: () => {}, info: () => {} },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signInWithPassword: async () => { throw new Error('supabase exploded') } },
  }),
}))

import { POST } from '@/app/api/auth/login/route'

describe('POST /api/auth/login internal error', () => {
  it('alerts without leaking credentials and keeps the 500 response', async () => {
    const res = await POST(new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify({ email: 'owner@secret-mail.test', password: 'Sup3rSecretPw' }),
    }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'An unexpected error occurred' })
    expect(m.alert).toHaveBeenCalledTimes(1)
    expect(m.alert.mock.calls[0][0]).toMatchObject({ key: 'auth:login_error', severity: 'critical' })
    const dump = JSON.stringify([m.alert.mock.calls, m.logs])
    expect(dump).not.toContain('Sup3rSecretPw')
    expect(dump).not.toContain('owner@secret-mail.test')
  })
})
