import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  rpcResult: { error: null } as { error: { message: string } | null },
  rpcThrows: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (...a: unknown[]) => { m.rpc(...a); if (m.rpcThrows) throw new Error('boom'); return m.rpcResult },
  }),
}))

import { recordPhoneLead } from '@/lib/auth/phone-leads'

beforeEach(() => {
  vi.clearAllMocks()
  m.rpcResult = { error: null }; m.rpcThrows = false
})

describe('recordPhoneLead (real implementation)', () => {
  it('calls the RPC with the right args', async () => {
    await recordPhoneLead({ phoneE164: '919876543210', email: 'a@b.com', fullName: 'Asha', userId: 'u1', consent: true })
    expect(m.rpc).toHaveBeenCalledWith('record_owner_phone_lead', {
      p_phone: '919876543210', p_email: 'a@b.com', p_full_name: 'Asha', p_user_id: 'u1', p_consent: true,
    })
  })
  it('swallows RPC errors and thrown errors', async () => {
    const args = { phoneE164: '919876543210', email: null, fullName: null, userId: 'u1', consent: null }
    m.rpcResult = { error: { message: 'nope' } }
    await expect(recordPhoneLead(args)).resolves.toBeUndefined()
    m.rpcThrows = true
    await expect(recordPhoneLead(args)).resolves.toBeUndefined()
  })
})
