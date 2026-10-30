import { describe, it, expect, vi } from 'vitest'
import { isExpiredBeyondReminderWindow } from '@/lib/whatsapp/reminderWindow'
import { drainSendQueue } from '@/lib/whatsapp/queue'

describe('isExpiredBeyondReminderWindow', () => {
  it('exactly 3 months ago is still inside the window', () => {
    expect(isExpiredBeyondReminderWindow('2026-07-28', '2026-10-28')).toBe(false)
  })
  it('one day over is outside', () => {
    expect(isExpiredBeyondReminderWindow('2026-07-27', '2026-10-28')).toBe(true)
  })
  it('clamps at month end (31 May minus 3 months = 28 Feb)', () => {
    expect(isExpiredBeyondReminderWindow('2026-02-28', '2026-05-31')).toBe(false)
    expect(isExpiredBeyondReminderWindow('2026-02-27', '2026-05-31')).toBe(true)
  })
  it('null/empty end date and future end date are never beyond', () => {
    expect(isExpiredBeyondReminderWindow(null, '2026-10-28')).toBe(false)
    expect(isExpiredBeyondReminderWindow('2026-12-01', '2026-10-28')).toBe(false)
  })
})

function makeClient(queue: any[], logs: any[]) {
  const builder = (table: string) => {
    const filters: Array<(r: any) => boolean> = []
    let mode = 'select'; let patch: any = null; let head = false
    const q: any = {
      select: (_c?: string, o?: any) => { head = !!o?.head; return q },
      update: (p: any) => { mode = 'update'; patch = p; return q },
      insert: () => { mode = 'insert'; return q },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
      lte: (c: string, v: string) => { filters.push(r => r[c] <= v); return q },
      order: () => q, limit: () => q, maybeSingle: () => q,
      then: (resolve: (v: any) => void) => {
        const src = table === 'whatsapp_automation_logs' ? logs : queue
        const rows = src.filter(r => filters.every(f => f(r)))
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
const row = (template: string): any => ({
  id: 'q1', gym_id: 'gym-1', member_id: 'mem-1', template_name: template,
  context: { phone: '9876543210', gymName: 'G', memberName: 'A', gymId: 'gym-1' },
  log_row_id: 'log1', attempts: 0, max_attempts: 3, status: 'pending',
  scheduled_at: new Date(Date.now() - 1000).toISOString(),
})
const base = { takeToken: async () => ({ success: true, remaining: 100 }), reschedule: async () => false, today: () => '2026-10-28' }

describe('drainSendQueue send-time 3-month re-check', () => {
  it('cancels an old queued expired message without sending', async () => {
    const queue = [row('membership_expired')]; const logs = [{ id: 'log1', status: 'sent' }]
    const sender = vi.fn()
    await drainSendQueue({ supabase: makeClient(queue, logs), sender, latestEndDate: async () => '2026-06-01', ...base })
    expect(sender).not.toHaveBeenCalled()
    expect(queue[0].status).toBe('cancelled')
    expect(logs[0].status).toBe('cancelled')
  })
  it('sends when the member renewed (latest end_date is recent/future)', async () => {
    const queue = [row('membership_expiry_reminder')]
    const sender = vi.fn(async () => ({ success: true, messageId: 'm' }))
    await drainSendQueue({ supabase: makeClient(queue, []), sender, latestEndDate: async () => '2026-11-20', ...base })
    expect(sender).toHaveBeenCalledTimes(1)
    expect(queue[0].status).toBe('sent')
  })
  it('does not apply to non-expiry templates', async () => {
    const queue = [row('payment_due_reminder')]
    const sender = vi.fn(async () => ({ success: true, messageId: 'm' }))
    const latestEndDate = vi.fn(async () => '2020-01-01')
    await drainSendQueue({ supabase: makeClient(queue, []), sender, latestEndDate, ...base })
    expect(sender).toHaveBeenCalledTimes(1)
    expect(latestEndDate).not.toHaveBeenCalled()
  })
})
