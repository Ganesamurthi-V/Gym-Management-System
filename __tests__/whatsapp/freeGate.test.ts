/**
 * The owner's member-app invitation must pass the server-resolved gym id into the WhatsApp send,
 * otherwise the send skips the per-gym gate (switch and Free-plan check).
 */

import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@/lib/whatsapp/sender', () => ({
  sendWhatsAppTemplate: (...a: unknown[]) => h.send(...a),
}))

const member = {
  id: 'm1', name: 'Arjun', phone: '9876543210', email: 'a@x.test',
  auth_user_id: 'u1', portal_suspended: false, invitation_status: 'not_sent',
}

/** Chainable query builder: every call returns itself, awaiting or .single() yields the table's row. */
function builder(row: unknown) {
  const b: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'update', 'insert']) b[k] = () => b
  b.single = async () => ({ data: row, error: null })
  b.maybeSingle = async () => ({ data: null, error: null })
  b.then = (res: (v: unknown) => unknown) => res({ data: row, error: null })
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }) },
    from: (t: string) => builder(t === 'gyms' ? { id: 'gym-1', name: 'Iron Temple' } : t === 'members' ? member : null),
  }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => builder(null),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { id: 'u1', user_metadata: {}, app_metadata: {} } }, error: null }),
        updateUserById: async () => ({ error: null }),
      },
    },
  }),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/dal', () => ({ getAuthUser: vi.fn(), getGym: vi.fn() }))

describe('owner member-app invitation', () => {
  it('passes the server-resolved gym id into sendWhatsAppTemplate', async () => {
    process.env.SUPABASE_URL = 'https://x.supabase.test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
    h.send.mockResolvedValue({ success: true })
    const { memberRowAction } = await import('@/app/owner/member-app/actions')
    const r = await memberRowAction('send_invitation', 'm1')
    expect(r.success).toBe(true)
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls[0][0]).toBe('member_app_invitation')
    expect(h.send.mock.calls[0][1]).toMatchObject({ gymId: 'gym-1' })
  })
})
