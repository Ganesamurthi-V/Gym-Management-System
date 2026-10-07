/**
 * The per-gym WhatsApp switch (gyms.whatsapp_enabled), at the two places it is enforced:
 *   - getGymWhatsAppState: reading the flag, and what an unreadable flag means;
 *   - sendTemplate: the choke point every send passes through, which must not call Meta for a
 *     gym that is switched off, and must not change anything for a send with no gym id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetchJson: vi.fn(),
}))

vi.mock('@/lib/fetch', () => ({ fetchJson: (...a: unknown[]) => h.fetchJson(...a) }))

import { getGymWhatsAppState, isWhatsAppEnabledForGym, WHATSAPP_DISABLED_MESSAGE } from '@/lib/whatsapp/gymGate'
import { sendTemplate } from '@/services/whatsapp/graph'
import type { TemplateContext } from '@/types/whatsapp'

/** A client that answers the one query the gate makes: gyms.select(whatsapp_enabled).eq(id).maybeSingle(). */
function client(result: { data: unknown; error: unknown } | (() => never)) {
  return {
    from: (table: string) => {
      expect(table).toBe('gyms')
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (typeof result === 'function') return result()
              return result
            },
          }),
        }),
      }
    },
  } as never
}

describe('getGymWhatsAppState', () => {
  it("is 'enabled' when the switch is on", async () => {
    expect(await getGymWhatsAppState('g', client({ data: { whatsapp_enabled: true }, error: null }))).toBe('enabled')
  })

  it("is 'disabled' only when the switch is explicitly false", async () => {
    expect(await getGymWhatsAppState('g', client({ data: { whatsapp_enabled: false }, error: null }))).toBe('disabled')
  })

  it('treats a missing value as on, since the column defaults to true', async () => {
    expect(await getGymWhatsAppState('g', client({ data: { whatsapp_enabled: null }, error: null }))).toBe('enabled')
  })

  it("is 'unknown' for a gym that does not exist", async () => {
    expect(await getGymWhatsAppState('g', client({ data: null, error: null }))).toBe('unknown')
  })

  it("is 'unknown' when the database errors, and never throws", async () => {
    expect(await getGymWhatsAppState('g', client({ data: null, error: new Error('db down') }))).toBe('unknown')
    expect(await getGymWhatsAppState('g', client(() => { throw new Error('network') }))).toBe('unknown')
  })

  it('does not allow sending unless the gym is known to be enabled', async () => {
    expect(await isWhatsAppEnabledForGym('g', client({ data: { whatsapp_enabled: true }, error: null }))).toBe(true)
    expect(await isWhatsAppEnabledForGym('g', client({ data: { whatsapp_enabled: false }, error: null }))).toBe(false)
    expect(await isWhatsAppEnabledForGym('g', client({ data: null, error: new Error('x') }))).toBe(false)
  })
})

describe('sendTemplate honours the gym switch', () => {
  const ctx: TemplateContext = { phone: '9876543210', gymName: 'Iron Temple', memberName: 'Arjun', plan: 'Monthly', startDate: '2026-07-06', memberId: 'GF00001' }

  beforeEach(() => {
    h.fetchJson.mockReset()
    h.fetchJson.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1' }] } })
    process.env.WHATSAPP_BASE_URL = 'https://graph.example.test'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
  })

  it('calls Meta for a send with no gym id, exactly as before', async () => {
    const r = await sendTemplate('_gymflow_welcome_member', ctx)
    expect(r.success).toBe(true)
    expect(h.fetchJson).toHaveBeenCalledTimes(1)
  })

  describe('with a gym id', () => {
    it('does not call Meta when the gym is switched off, and says why', async () => {
      vi.resetModules()
      vi.doMock('@/lib/whatsapp/gymGate', async importOriginal => ({
        ...(await importOriginal<typeof import('@/lib/whatsapp/gymGate')>()),
        getGymWhatsAppState: async () => 'disabled' as const,
      }))
      const { sendTemplate: send } = await import('@/services/whatsapp/graph')
      const r = await send('_gymflow_welcome_member', { ...ctx, gymId: 'gym-off' })
      expect(r.success).toBe(false)
      expect(r.skipped).toBe(true)
      expect(r.error).toBe(WHATSAPP_DISABLED_MESSAGE)
      expect(h.fetchJson).not.toHaveBeenCalled()
      vi.doUnmock('@/lib/whatsapp/gymGate')
    })

    it('does not call Meta when the switch cannot be read', async () => {
      vi.resetModules()
      vi.doMock('@/lib/whatsapp/gymGate', async importOriginal => ({
        ...(await importOriginal<typeof import('@/lib/whatsapp/gymGate')>()),
        getGymWhatsAppState: async () => 'unknown' as const,
      }))
      const { sendTemplate: send } = await import('@/services/whatsapp/graph')
      const r = await send('_gymflow_welcome_member', { ...ctx, gymId: 'gym-x' })
      expect(r.success).toBe(false)
      expect(r.skipped).toBe(true)
      expect(h.fetchJson).not.toHaveBeenCalled()
      vi.doUnmock('@/lib/whatsapp/gymGate')
    })

    it('sends normally when the gym is switched on', async () => {
      vi.resetModules()
      vi.doMock('@/lib/whatsapp/gymGate', async importOriginal => ({
        ...(await importOriginal<typeof import('@/lib/whatsapp/gymGate')>()),
        getGymWhatsAppState: async () => 'enabled' as const,
      }))
      const { sendTemplate: send } = await import('@/services/whatsapp/graph')
      const r = await send('_gymflow_welcome_member', { ...ctx, gymId: 'gym-on' })
      expect(r.success).toBe(true)
      expect(h.fetchJson).toHaveBeenCalledTimes(1)
      vi.doUnmock('@/lib/whatsapp/gymGate')
    })
  })
})
