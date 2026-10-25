/**
 * The per-gym WhatsApp switch (gyms.whatsapp_enabled), at the two places it is enforced:
 *   - getGymWhatsAppState: reading the flag, and what an unreadable flag means;
 *   - sendTemplate: the choke point every send passes through, which must not call Meta for a
 *     gym that is switched off, and must not change anything for a send with no gym id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
// The recipient-window RPC needs a database; these tests are about the send path, so slots are always granted.
vi.mock('@/lib/whatsapp/recipientLimit', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp/recipientLimit')>()),
  reserveRecipient: async () => ({ allowed: true, isNew: true }),
  releaseRecipient: async () => {},
}))

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

  it('blocks a Free gym with no WhatsApp add-on', async () => {
    const row = { whatsapp_enabled: true, plan_type: 'free', whatsapp_addon_until: null }
    expect(await getGymWhatsAppState('g', client({ data: row, error: null }))).toBe('disabled')
    expect(await isWhatsAppEnabledForGym('g', client({ data: row, error: null }))).toBe(false)
  })

  it('blocks a Free gym whose add-on has lapsed', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const row = { whatsapp_enabled: true, plan_type: 'free', whatsapp_addon_until: past }
    expect(await isWhatsAppEnabledForGym('g', client({ data: row, error: null }))).toBe(false)
  })

  it('allows a Free gym while its add-on is running', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const row = { whatsapp_enabled: true, plan_type: 'free', whatsapp_addon_until: future }
    expect(await isWhatsAppEnabledForGym('g', client({ data: row, error: null }))).toBe(true)
  })

  it('still allows a trial gym, and still honours the switch for a Free gym with the add-on', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(await isWhatsAppEnabledForGym('g', client({ data: { whatsapp_enabled: true, plan_type: 'trial', whatsapp_addon_until: null }, error: null }))).toBe(true)
    expect(await isWhatsAppEnabledForGym('g', client({ data: { whatsapp_enabled: false, plan_type: 'free', whatsapp_addon_until: future }, error: null }))).toBe(false)
  })
})

/**
 * A client for the full gate: gyms row (maybeSingle) plus the trial-coverage query on members
 * (select.eq.order.order.limit). `memberIds` is the join-ordered list of the gym's members.
 */
function gateClient(gym: Record<string, unknown>, memberIds: string[] = []) {
  return {
    from: (table: string) => {
      if (table === 'gyms') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: gym, error: null }) }) }) }
      }
      expect(table).toBe('members')
      return {
        select: () => ({
          eq: () => ({ order: () => ({ order: () => ({ limit: async (n: number) => ({ data: memberIds.slice(0, n).map(id => ({ id })), error: null }) }) }) }),
        }),
      }
    },
  } as never
}

describe('getGymWhatsAppState subscription and trial rules', () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()
  const live = { whatsapp_enabled: true, is_active: true, subscription_status: 'active', plan_type: 'monthly', subscription_ends_at: future, trial_ends_at: null, whatsapp_addon_until: null }

  it('is enabled for an active paid gym', async () => {
    expect(await getGymWhatsAppState('g', gateClient(live))).toBe('enabled')
  })

  it.each([
    ['an expired trial', { ...live, plan_type: 'trial', subscription_status: 'trial', trial_ends_at: past, subscription_ends_at: null }],
    ['a suspended gym', { ...live, subscription_status: 'suspended' }],
    ['a cancelled gym', { ...live, subscription_status: 'cancelled' }],
    ['a deactivated gym', { ...live, is_active: false }],
    ['a lapsed paid plan', { ...live, subscription_ends_at: past }],
  ])('is disabled for %s', async (_l, gym) => {
    expect(await getGymWhatsAppState('g', gateClient(gym))).toBe('disabled')
  })

  it('is enabled for a Free gym with a live WhatsApp add-on', async () => {
    const free = { ...live, plan_type: 'free', subscription_status: 'active', subscription_ends_at: null, whatsapp_addon_until: future }
    expect(await getGymWhatsAppState('g', gateClient(free))).toBe('enabled')
  })

  describe('trial gym covers only its first 50 members', () => {
    const trial = { ...live, plan_type: 'trial', subscription_status: 'trial', trial_ends_at: future, subscription_ends_at: null }
    const ids = Array.from({ length: 60 }, (_, i) => `m${i + 1}`)

    it('allows the member ranked 1 and the one ranked 50, denies the one ranked 51', async () => {
      expect(await getGymWhatsAppState('g', gateClient(trial, ids), 'm1')).toBe('enabled')
      expect(await getGymWhatsAppState('g', gateClient(trial, ids), 'm50')).toBe('enabled')
      expect(await getGymWhatsAppState('g', gateClient(trial, ids), 'm51')).toBe('disabled')
    })

    it('denies a member-facing send whose member is unknown (null), fail closed', async () => {
      expect(await getGymWhatsAppState('g', gateClient(trial, ids), null)).toBe('disabled')
    })

    it('does not apply the member rule to a gym-level question (member undefined)', async () => {
      expect(await getGymWhatsAppState('g', gateClient(trial, ids))).toBe('enabled')
    })

    it('does not apply the member rule to a paid gym', async () => {
      expect(await getGymWhatsAppState('g', gateClient(live, []), null)).toBe('enabled')
    })

    it("is 'unknown' when the coverage lookup fails", async () => {
      const broken = {
        from: (t: string) => t === 'gyms'
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: trial, error: null }) }) }) }
          : { select: () => ({ eq: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: null, error: new Error('db') }) }) }) }) }) },
      } as never
      expect(await getGymWhatsAppState('g', broken, 'm1')).toBe('unknown')
    })
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

    it('passes the members.id (not the printed GF id) to the gate', async () => {
      vi.resetModules()
      const spy = vi.fn(async () => 'enabled' as const)
      vi.doMock('@/lib/whatsapp/gymGate', async importOriginal => ({
        ...(await importOriginal<typeof import('@/lib/whatsapp/gymGate')>()),
        getGymWhatsAppState: spy,
      }))
      const { sendTemplate: send } = await import('@/services/whatsapp/graph')
      await send('_gymflow_welcome_member', { ...ctx, gymId: 'gym-on', memberRowId: 'uuid-1' })
      expect(spy).toHaveBeenCalledWith('gym-on', undefined, 'uuid-1')
      await send('_gymflow_welcome_member', { ...ctx, gymId: 'gym-on' })
      expect(spy).toHaveBeenLastCalledWith('gym-on', undefined, null)
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
