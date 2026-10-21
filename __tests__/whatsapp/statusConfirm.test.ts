/** Status webhooks carry biz_opaque_callback_data through to confirmQueuedSend; 'failed' never confirms. */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ confirm: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/whatsapp/queue', () => ({ confirmQueuedSend: (...a: unknown[]) => h.confirm(...a) }))
vi.mock('@/lib/whatsapp/idempotency', () => ({ checkAndMarkEvent: vi.fn() }))
vi.mock('@/repositories/whatsapp/whatsappRepository', () => ({ updateMessageStatus: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { parseStatuses } from '@/lib/whatsapp/parseWebhook'
import { webhookPayloadSchema } from '@/lib/whatsapp/webhookSchemas'
import { confirmQueuedFromStatus } from '@/services/whatsapp/statusProcessor'

const log: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

const payload = (status: string) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'e', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '1', phone_number_id: '2' },
    statuses: [{ id: 'wamid.1', status, timestamp: '1700000000', recipient_id: '919876543210', biz_opaque_callback_data: 'row-1' }],
  } }] }],
})

describe('status webhook confirmation', () => {
  beforeEach(() => { h.confirm.mockReset().mockResolvedValue({ updated: true }) })

  it('parses biz_opaque_callback_data into bizOpaqueData', () => {
    const parsed = webhookPayloadSchema.parse(payload('sent'))
    expect(parseStatuses(parsed as any)[0].bizOpaqueData).toBe('row-1')
  })

  it('confirms on sent, delivered and read', async () => {
    for (const s of ['sent', 'delivered', 'read']) {
      const st = parseStatuses(webhookPayloadSchema.parse(payload(s)) as any)[0]
      await confirmQueuedFromStatus(st, log)
    }
    expect(h.confirm).toHaveBeenCalledTimes(3)
    expect(h.confirm.mock.calls[0].slice(1)).toEqual(['row-1', 'wamid.1'])
  })

  it('does not confirm on failed', async () => {
    const st = parseStatuses(webhookPayloadSchema.parse(payload('failed')) as any)[0]
    await confirmQueuedFromStatus(st, log)
    expect(h.confirm).not.toHaveBeenCalled()
  })

  it('never throws when confirmation errors', async () => {
    h.confirm.mockRejectedValue(new Error('boom'))
    const st = parseStatuses(webhookPayloadSchema.parse(payload('sent')) as any)[0]
    await expect(confirmQueuedFromStatus(st, log)).resolves.toBeUndefined()
  })
})
