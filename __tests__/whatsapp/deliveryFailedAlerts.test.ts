/**
 * delivery_failed rows hold the reminder slot (same as 'failed'), so the cron never re-queues a
 * reminder to a number Meta reported as undeliverable. Same in-memory fake as
 * automation.integration.test.ts.
 *
 * Integration tests for the WhatsApp automation engine (lib/whatsapp/automation.ts).
 *
 * These run the real scheduler against an in-memory fake of Supabase and a mocked
 * template sender, advancing a fake clock day by day. They prove the two headline
 * fixes end-to-end:
 *
 *   B1 — payment_due_reminder sends every 3 days (max 7), NOT every day.
 *   B2 — cancelReminderCycles actually stops a cycle, even when a reminder was
 *        already sent on the same day (partial unique index lets the 'cancelled'
 *        sentinel row through).
 *
 * plus the surrounding guarantees: same-day dedup, expiry cadence, renewal
 * cancellation, welcome idempotency, and birthday once-per-year.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { format } from 'date-fns'

// ─── Shared mock state (hoisted so the vi.mock factories can see it) ──────────

const h = vi.hoisted(() => {
  return {
    store: { 
      gyms: [] as any[], 
      members: [] as any[], 
      whatsapp_automation_logs: [] as any[],
      whatsapp_send_queue: [] as any[],
      attendance: [] as any[],
      gym_gamification_settings: [] as any[],
    },
    sendMock: vi.fn(),
    /** null = the real enable-list (empty by default); an array = pretend these are enabled. */
    enabledGamification: null as string[] | null,
  }
})

vi.mock('@/lib/monitoring/alert', () => ({ reportAlert: vi.fn(async () => {}), reportAlertInBackground: vi.fn() }))
vi.mock('@/lib/whatsapp/sender', () => ({
  sendWhatsAppTemplate: (...args: any[]) => h.sendMock(...args),
}))

// The gamification enable-list ships empty. Tests that need a template "approved" set
// h.enabledGamification; everything else runs against the real list.
vi.mock('@/config/whatsapp', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    isGamificationTemplateEnabled: (id: string) =>
      h.enabledGamification ? h.enabledGamification.includes(id) : actual.isGamificationTemplateEnabled(id),
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeFakeClient(),
}))

// The automation module checks SUPABASE_URL/SERVICE_ROLE_KEY before calling
// createClient (which is mocked above). Set dummy values so the guard passes.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

vi.mock('@/lib/whatsapp/queue', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    kickDrain: async () => {
      const supabase = makeFakeClient()
      // Drain the queue fully until empty.
      // drainSendQueue handles 5 at a time, so loop if needed.
      let remaining = 1
      while (remaining > 0) {
        const stats = await actual.drainSendQueue({
          supabase,
          sender: (...args: any[]) => h.sendMock(...args),
          takeToken: async () => ({ success: true, remaining: 100 }),
          reschedule: async () => false,
        })
        remaining = stats.remaining
      }
      return true
    }
  }
})

// ─── Minimal in-memory Supabase query builder ────────────────────────────────

let seqCounter = 0
function stamp(): string {
  // Align sent_at with the LOCAL date used by the engine's `today` so date-only
  // comparisons are internally consistent regardless of the test runner's TZ.
  // A monotonic millisecond field guarantees insertion order == sort order, which
  // real Postgres NOW() gives us for free (the fake clock is day-granular).
  const ms = String(seqCounter++ % 1000).padStart(3, '0')
  return `${format(new Date(), 'yyyy-MM-dd')}T12:00:00.${ms}Z`
}

class FakeQuery {
  private filters: Array<(r: any) => boolean> = []
  private _order: { col: string; ascending: boolean } | null = null
  private _limit: number | null = null
  private _range: [number, number] | null = null
  private _mode: 'select' | 'insert' | 'update' = 'select'
  private _row: any = null
  private _updates: any = null
  private _single = false

  constructor(private store: Record<string, any[]>, private table: string) {}

  select() { return this }
  single() { this._single = true; return this }
  maybeSingle() { this._single = true; return this }
  update(row: any) { this._mode = 'update'; this._updates = row; return this }
  eq(col: string, val: unknown) { this.filters.push(r => r[col] === val); return this }
  gte(col: string, val: string) { this.filters.push(r => r[col] >= val); return this }
  gt(col: string, val: string) { this.filters.push(r => r[col] > val); return this }
  lt(col: string, val: string) { this.filters.push(r => r[col] < val); return this }
  lte(col: string, val: string) { this.filters.push(r => r[col] <= val); return this }
  in(col: string, vals: unknown[]) { this.filters.push(r => vals.includes(r[col])); return this }
  not(col: string, _op: string, _val: unknown) {
    this.filters.push(r => r[col] !== null && r[col] !== undefined)
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this._order = { col, ascending: opts?.ascending !== false }
    return this
  }
  limit(n: number) { this._limit = n; return this }
  range(from: number, to: number) { this._range = [from, to]; return this }
  insert(row: any) { this._mode = 'insert'; this._row = row; return this }

  private runSelect() {
    let rows = (this.store[this.table] ?? []).filter(r => this.filters.every(f => f(r)))
    if (this._order) {
      const { col, ascending } = this._order
      rows = rows.slice().sort((a, b) =>
        a[col] < b[col] ? (ascending ? -1 : 1) : a[col] > b[col] ? (ascending ? 1 : -1) : 0,
      )
    }
    if (this._limit != null) rows = rows.slice(0, this._limit)
    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1)
    return { data: this._single ? (rows[0] ?? null) : rows, error: null }
  }

  private runInsert() {
    const row = { ...this._row }
    if (!row.sent_at) row.sent_at = stamp()
    if (!row.id) row.id = `log_${(this.store[this.table]?.length ?? 0) + 1}`

    if (this.table === 'whatsapp_send_queue') {
      // Postgres defaults
      if (row.attempts === undefined) row.attempts = 0
      if (row.max_attempts === undefined) row.max_attempts = 3
      if (!row.scheduled_at) row.scheduled_at = new Date(Date.now() - 1000).toISOString()
    }

    // Emulate the partial unique index: one 'sent' row per member+template+day.
    if (row.status === 'sent') {
      const day = row.sent_at.slice(0, 10)
      const dup = (this.store[this.table] ?? []).some(
        r => r.status === 'sent'
          && r.member_id === row.member_id
          && r.template_name === row.template_name
          && String(r.sent_at).slice(0, 10) === day,
      )
      if (dup) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
      }
    }

    this.store[this.table].push(row)
    return { data: this._single ? row : [row], error: null }
  }

  private runUpdate() {
    const rows = (this.store[this.table] ?? []).filter(r => this.filters.every(f => f(r)))
    for (const r of rows) Object.assign(r, this._updates)
    return { data: this._single ? (rows[0] ?? null) : rows, error: null }
  }

  private run() {
    if (this._mode === 'insert') return this.runInsert()
    if (this._mode === 'update') return this.runUpdate()
    return this.runSelect()
  }

  // Thenable so `await query...` and `await query.insert(...)` both work.
  then(resolve: (v: any) => void, reject?: (e: unknown) => void) {
    try { resolve(this.run()) } catch (e) { reject ? reject(e) : Promise.reject(e) }
  }
}

function makeFakeClient() {
  return { from: (table: string) => new FakeQuery(h.store, table) }
}

// ─── Test harness ─────────────────────────────────────────────────────────────

// Import AFTER mocks are registered.
import {
  runDailyWhatsAppAutomation,
  runImportBatchAutomation,
  cancelReminderCycles,
  sendWelcomeMessage,
  sendPrizeAwardedMessage,
} from '@/lib/whatsapp/automation'
import { drainSendQueue } from '@/lib/whatsapp/queue'
import type { TemplateId, TemplateContext, SendResult } from '@/types/whatsapp'

const DAY = 86_400_000
const START = Date.UTC(2026, 6, 6, 12, 0, 0) // 2026-07-06 12:00 UTC

function setDay(n: number) { vi.setSystemTime(new Date(START + n * DAY)) }
function label(n: number) { return format(new Date(START + n * DAY), 'yyyy-MM-dd') }

function sendCountFor(template: string) {
  return h.sendMock.mock.calls.filter(c => c[0] === template).length
}
function logsFor(template: string) {
  return h.store.whatsapp_automation_logs.filter(r => r.template_name === template)
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(120)

  h.store.gyms = [{ id: 'gym-1', name: 'Iron Temple', onboarding_completed: true, subscription_status: 'active', whatsapp_enabled: true }]
  h.store.members = []
  h.store.whatsapp_automation_logs = []
  h.store.whatsapp_send_queue = []
  h.store.attendance = []
  h.store.gym_gamification_settings = []
  h.enabledGamification = null
  h.sendMock.mockReset()
  h.sendMock.mockImplementation(async (template: string) => ({
    success: true,
    messageId: `wamid.${template}.${seqCounter}`,
  }))
  seqCounter = 0

  vi.useFakeTimers()
  setDay(0)
})

afterEach(() => {
  vi.useRealTimers()
})

function addMember(overrides: Partial<any> = {}) {
  const member = {
    id: overrides.id ?? 'mem-1',
    gym_id: 'gym-1',
    name: overrides.name ?? 'Arjun',
    phone: overrides.phone ?? '9876543210',
    date_of_birth: overrides.date_of_birth ?? null,
    pending_amount: overrides.pending_amount ?? 0,
    memberships: overrides.memberships ?? [],
  }
  h.store.members.push(member)
  return member
}

describe('delivery_failed holds the reminder slot', () => {
  it('does not re-queue the same cycle after Meta reports a delivery failure', async () => {
    addMember({ pending_amount: 500 })

    setDay(0)
    await runDailyWhatsAppAutomation()
    const rows = logsFor('payment_due_reminder')
    expect(rows).toHaveLength(1)
    const cycleKey = rows[0].cycle_key

    // What statusProcessor does when Meta's status webhook says "failed".
    rows[0].status = 'delivery_failed'
    rows[0].error_message = 'Meta 131026: Message undeliverable'
    const callsAfterDay0 = sendCountFor('payment_due_reminder')

    // Same day (the unique 'sent' index no longer applies) and the next two days: nothing goes out.
    await runDailyWhatsAppAutomation()
    setDay(1)
    await runDailyWhatsAppAutomation()
    setDay(2)
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('payment_due_reminder')).toBe(callsAfterDay0)
    expect(logsFor('payment_due_reminder')).toHaveLength(1)

    // After the normal 3-day gap it continues the SAME cycle, exactly like a 'failed' row would.
    setDay(3)
    await runDailyWhatsAppAutomation()
    expect(logsFor('payment_due_reminder').every(r => r.cycle_key === cycleKey)).toBe(true)
  })

  it('does not resend a welcome message whose delivery failed', async () => {
    addMember({ id: 'mem-2' })
    const args = {
      gymId: 'gym-1', gymName: 'Iron Temple', memberId: 'mem-2',
      memberName: 'Arjun', phone: '9876543210', plan: 'monthly', startDate: label(0),
    }
    await sendWelcomeMessage(args)
    h.store.whatsapp_automation_logs.filter(r => r.status === 'sent').forEach(r => { r.status = 'delivery_failed' })
    const calls = sendCountFor('_gymflow_welcome_member')
    await sendWelcomeMessage(args)
    expect(sendCountFor('_gymflow_welcome_member')).toBe(calls)
  })
})
