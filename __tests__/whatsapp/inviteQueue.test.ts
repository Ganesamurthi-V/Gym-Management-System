import { describe, it, expect, vi } from 'vitest'
import { drainSendQueue } from '@/lib/whatsapp/queue'
import type { TemplateId, TemplateContext, SendResult } from '@/types/whatsapp'

// Minimal in-memory client for whatsapp_send_queue + member_portal_activity.
function makeClient(queue: any[], activity: any[]) {
  const builder = (table: string) => {
    const filters: Array<(r: any) => boolean> = []
    let mode: 'select' | 'update' | 'insert' = 'select'
    let patch: any = null
    let head = false
    const q: any = {
      select: (_c?: string, o?: any) => { head = !!o?.head; return q },
      update: (p: any) => { mode = 'update'; patch = p; return q },
      insert: (r: any) => { mode = 'insert'; if (table === 'member_portal_activity') activity.push(r); return q },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
      lte: (c: string, v: string) => { filters.push(r => r[c] <= v); return q },
      order: () => q,
      limit: () => q,
      maybeSingle: () => q,
      then: (resolve: (v: any) => void) => {
        const rows = queue.filter(r => filters.every(f => f(r)))
        if (mode === 'insert') return resolve({ error: null })
        if (mode === 'update') { rows.forEach(r => Object.assign(r, patch)); return resolve({ data: rows[0] ?? null, error: null }) }
        if (head) return resolve({ count: rows.length })
        resolve({ data: rows[0] ?? null, error: null })
      },
    }
    return q
  }
  return { from: builder } as any
}

const row = (template: TemplateId): any => ({
  id: 'q1', gym_id: 'gym-1', member_id: 'mem-1', template_name: template,
  context: { phone: '9876543210', gymName: 'Iron Temple', memberName: 'Arjun', gymId: 'gym-1' },
  log_row_id: null, attempts: 0, max_attempts: 3, status: 'pending',
  scheduled_at: new Date(Date.now() - 1000).toISOString(),
})

const baseDeps = {
  takeToken: async () => ({ success: true, remaining: 100 }),
  reschedule: async () => false,
}

describe('drainSendQueue: member_app_invitation', () => {
  it('fills the token before sending and logs the activity', async () => {
    const queue = [row('member_app_invitation')]
    const activity: any[] = []
    const prepare = vi.fn(async (r: any) => ({ ok: true as const, context: { ...r.context, invitationToken: 'tok.abc' } }))
    const sender = vi.fn(async (_t: TemplateId, _c: TemplateContext): Promise<SendResult> => ({ success: true, messageId: 'wamid.1' }))

    const stats = await drainSendQueue({ supabase: makeClient(queue, activity), sender, prepare, ...baseDeps })

    expect(prepare).toHaveBeenCalledTimes(1)
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender.mock.calls[0][1]).toMatchObject({ invitationToken: 'tok.abc', gymId: 'gym-1' })
    expect(queue[0].status).toBe('sent')
    expect(stats.sent).toBe(1)
    expect(activity).toEqual([{ gym_id: 'gym-1', member_id: 'mem-1', activity: 'invitation_resent', performed_by: 'owner' }])
  })

  it('fails the row without sending when prepare fails permanently', async () => {
    const queue = [row('member_app_invitation')]
    const activity: any[] = []
    const prepare = vi.fn(async () => ({ ok: false as const, error: 'ALREADY_ACTIVATED: done', permanent: true }))
    const sender = vi.fn(async (): Promise<SendResult> => ({ success: true }))

    const stats = await drainSendQueue({ supabase: makeClient(queue, activity), sender, prepare, ...baseDeps })

    expect(sender).not.toHaveBeenCalled()
    expect(queue[0].status).toBe('failed')
    expect(queue[0].last_error).toBe('ALREADY_ACTIVATED: done')
    expect(stats.failed).toBe(1)
    expect(activity).toHaveLength(0)
  })

  it('retries (back to pending) without sending when prepare fails transiently', async () => {
    const queue = [row('member_app_invitation')]
    const prepare = vi.fn(async () => ({ ok: false as const, error: 'AUTH_FAILED', permanent: false }))
    const sender = vi.fn(async (): Promise<SendResult> => ({ success: true }))

    const stats = await drainSendQueue({ supabase: makeClient(queue, []), sender, prepare, ...baseDeps })

    expect(sender).not.toHaveBeenCalled()
    expect(queue[0].status).toBe('pending')
    expect(stats.retried).toBe(1)
  })

  it('never calls prepare for other templates', async () => {
    const queue = [row('payment_due_reminder')]
    const prepare = vi.fn()
    const sender = vi.fn(async (): Promise<SendResult> => ({ success: true }))

    await drainSendQueue({ supabase: makeClient(queue, []), sender, prepare: prepare as any, ...baseDeps })

    expect(prepare).not.toHaveBeenCalled()
    expect(sender).toHaveBeenCalledTimes(1)
  })
})
