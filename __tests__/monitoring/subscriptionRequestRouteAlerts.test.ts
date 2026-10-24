import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  alert: vi.fn(), remove: vi.fn(), userRemove: vi.fn(), warn: vi.fn(),
  uploadPath: null as string | null, removed: [{ name: 'x' }] as unknown[],
}))

vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: (...a: unknown[]) => m.alert(...a) }))
vi.mock('@/lib/logger', () => ({ logger: { error() {}, warn: (...a: unknown[]) => m.warn(...a), info() {} } }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ remove: async (paths: string[]) => { m.remove(paths); return { data: m.removed, error: null } } }) },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.single = async () => ({ data: { id: 'gym-1' } })
      q.maybeSingle = async () => ({ data: null })
      q.insert = async () => ({ error: { message: 'insert blew up' } })
      return q
    },
    storage: {
      from: () => ({
        upload: async (path: string) => ({ data: { path: m.uploadPath ?? path }, error: null }),
        remove: async (paths: string[]) => { m.userRemove(paths); return { error: null } },
      }),
    },
  }),
}))

import { POST } from '@/app/api/subscription/request/route'

const call = () => {
  const form = new FormData()
  form.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])], 'p.jpg', { type: 'image/jpeg' }))
  return POST(new NextRequest('http://localhost/api/subscription/request', { method: 'POST', body: form }))
}

beforeEach(() => { vi.clearAllMocks(); m.uploadPath = null; m.removed = [{ name: 'x' }] })

describe('POST /api/subscription/request insert failure', () => {
  it('removes the orphan with the admin client and raises sub:request_insert_failed', async () => {
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not save your request. Please try again.' })
    expect(m.remove).toHaveBeenCalledTimes(1)
    expect(m.remove.mock.calls[0][0][0]).toMatch(/^u1\//)
    expect(m.userRemove).not.toHaveBeenCalled()
    expect(m.warn).not.toHaveBeenCalled()
    expect(m.alert.mock.calls[0][0]).toMatchObject({ key: 'sub:request_insert_failed', severity: 'critical', gymId: 'gym-1' })
  })

  it('never deletes a path outside the user prefix', async () => {
    m.uploadPath = 'other-user/file.jpg'
    await call()
    expect(m.remove).not.toHaveBeenCalled()
    expect(m.warn).toHaveBeenCalledWith('subscription_proof_cleanup_skipped', expect.anything())
  })

  it('warns when remove() returns no objects', async () => {
    m.removed = []
    await call()
    expect(m.warn).toHaveBeenCalledWith('subscription_proof_cleanup_failed', expect.anything())
  })
})
