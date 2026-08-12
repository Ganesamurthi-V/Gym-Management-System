/**
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
      whatsapp_send_queue: [] as any[]
    },
    sendMock: vi.fn(),
  }
})

vi.mock('@/lib/whatsapp/sender', () => ({
  sendWhatsAppTemplate: (...args: any[]) => h.sendMock(...args),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeFakeClient(),
}))

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
  cancelReminderCycles,
  sendWelcomeMessage,
} from '@/lib/whatsapp/automation'

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

  h.store.gyms = [{ id: 'gym-1', name: 'Iron Temple', onboarding_completed: true, subscription_status: 'active' }]
  h.store.members = []
  h.store.whatsapp_automation_logs = []
  h.store.whatsapp_send_queue = []
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

// ═══════════════════════════════════════════════════════════════════════════
// B1 — payment_due_reminder cadence
// ═══════════════════════════════════════════════════════════════════════════

describe('B1: payment_due_reminder sends every 3 days, not daily', () => {
  it('sends on days 0, 3, 6, 9 over a 10-day run (4 sends, not 10)', async () => {
    addMember({ pending_amount: 500 })

    for (let day = 0; day < 10; day++) {
      setDay(day)
      await runDailyWhatsAppAutomation()
    }

    expect(sendCountFor('payment_due_reminder')).toBe(4)
  })

  it('caps a persistent due at 7 reminders over a long run', async () => {
    addMember({ pending_amount: 500 })

    for (let day = 0; day < 40; day++) {
      setDay(day)
      await runDailyWhatsAppAutomation()
    }

    expect(sendCountFor('payment_due_reminder')).toBe(7)
  })

  it('keeps the whole cycle under a single stable cycle_key', async () => {
    addMember({ pending_amount: 500 })
    for (let day = 0; day < 10; day++) {
      setDay(day)
      await runDailyWhatsAppAutomation()
    }
    const keys = new Set(logsFor('payment_due_reminder').filter(r => r.status === 'sent').map(r => r.cycle_key))
    expect(keys.size).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Transient vs permanent send failures
// ═══════════════════════════════════════════════════════════════════════════

describe('send failures: transient retries, permanent consumes a slot', () => {
  const sentCount = (t: string) => logsFor(t).filter(r => r.status === 'sent').length

  it('does NOT consume a slot on a transient failure and retries the next day', async () => {
    addMember({ pending_amount: 500 })

    // Day 0 — transient failure (thrown exception → no httpStatus).
    h.sendMock.mockResolvedValueOnce({ success: false, error: 'network timeout' })
    setDay(0)
    await runDailyWhatsAppAutomation()

    const rows = logsFor('payment_due_reminder')
    expect(rows.some(r => r.status === 'error')).toBe(true)
    expect(rows.some(r => r.status === 'sent')).toBe(false)

    // Day 1 — API recovered. The slot was not consumed and the 3-day gate was
    // not advanced, so it retries immediately.
    setDay(1)
    await runDailyWhatsAppAutomation()
    expect(sentCount('payment_due_reminder')).toBe(1)
  })

  it('treats an exhausted 429/5xx as transient (retryable)', async () => {
    addMember({ pending_amount: 500 })

    h.sendMock.mockResolvedValueOnce({ success: false, httpStatus: 503, error: 'HTTP 503' })
    setDay(0)
    await runDailyWhatsAppAutomation()
    expect(logsFor('payment_due_reminder').some(r => r.status === 'error')).toBe(true)

    setDay(1)
    await runDailyWhatsAppAutomation()
    expect(sentCount('payment_due_reminder')).toBe(1)
  })

  it('consumes a slot on a permanent 4xx and enforces the 3-day gap', async () => {
    addMember({ pending_amount: 500 })

    // Day 0 — permanent failure (Meta 4xx, e.g. invalid recipient).
    h.sendMock.mockResolvedValueOnce({ success: false, httpStatus: 400, error: 'invalid recipient' })
    setDay(0)
    await runDailyWhatsAppAutomation()
    expect(logsFor('payment_due_reminder').some(r => r.status === 'failed')).toBe(true)

    // Day 1 — within the 3-day gap the failed attempt holds the slot: no retry.
    setDay(1)
    await runDailyWhatsAppAutomation()
    expect(sentCount('payment_due_reminder')).toBe(0)

    // Day 3 — gap elapsed: sends.
    setDay(3)
    await runDailyWhatsAppAutomation()
    expect(sentCount('payment_due_reminder')).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Atomic claim-before-send (no duplicate message under concurrency)
// ═══════════════════════════════════════════════════════════════════════════

describe('claim-before-send prevents duplicate messages', () => {
  it('does not double-send when a second run overlaps the first mid-send', async () => {
    addMember({ pending_amount: 500 })
    setDay(0)

    // Fire a *concurrent* cron run WHILE the first send is in flight. Under the
    // old send-then-record order the second run would see no 'sent' row yet and
    // send again. With claim-before-send the slot is already recorded, so the
    // overlapping run sees it and skips.
    let reentered = false
    h.sendMock.mockImplementationOnce(async (template: string) => {
      if (!reentered) {
        reentered = true
        await runDailyWhatsAppAutomation()
      }
      return { success: true, messageId: `wamid.${template}` }
    })

    await runDailyWhatsAppAutomation()

    expect(sendCountFor('payment_due_reminder')).toBe(1)
    expect(logsFor('payment_due_reminder').filter(r => r.status === 'sent').length).toBe(1)
  })

  it('welcome message survives a double-submit racing mid-send', async () => {
    addMember({ id: 'mem-1' })
    const args = {
      gymId: 'gym-1', gymName: 'Iron Temple', memberId: 'mem-1',
      memberName: 'Arjun', phone: '9876543210', plan: 'monthly', startDate: label(0),
    }

    let reentered = false
    h.sendMock.mockImplementationOnce(async (template: string) => {
      if (!reentered) {
        reentered = true
        await sendWelcomeMessage(args) // concurrent double-submit
      }
      return { success: true, messageId: `wamid.${template}` }
    })

    await sendWelcomeMessage(args)
    expect(sendCountFor('_gymflow_welcome_member')).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Same-day dedup
// ═══════════════════════════════════════════════════════════════════════════

describe('same-day dedup', () => {
  it('does not send twice if the cron runs twice in one day', async () => {
    addMember({ pending_amount: 500 })
    setDay(0)
    await runDailyWhatsAppAutomation()
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('payment_due_reminder')).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B2 — cancellation
// ═══════════════════════════════════════════════════════════════════════════

describe('B2: cancelReminderCycles actually stops the cycle', () => {
  it('sends no further due reminders after the due is cleared', async () => {
    const m = addMember({ pending_amount: 500 })

    setDay(0)
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('payment_due_reminder')).toBe(1)

    // Member pays in full → balance cleared + cycle cancelled (same day as a
    // send: this exercises the partial-index fix — the 'cancelled' row must
    // insert despite an existing same-day 'sent' row).
    m.pending_amount = 0
    await cancelReminderCycles({
      gymId: 'gym-1', memberId: m.id, phone: m.phone,
      templates: ['payment_due_reminder'],
    })

    expect(logsFor('payment_due_reminder').some(r => r.status === 'cancelled')).toBe(true)

    for (let day = 3; day <= 12; day += 3) {
      setDay(day)
      await runDailyWhatsAppAutomation()
    }
    expect(sendCountFor('payment_due_reminder')).toBe(1)
  })

  it('starts a fresh cycle if a NEW due appears after a cancelled one', async () => {
    const m = addMember({ pending_amount: 500 })

    setDay(0)
    await runDailyWhatsAppAutomation()
    await cancelReminderCycles({
      gymId: 'gym-1', memberId: m.id, phone: m.phone,
      templates: ['payment_due_reminder'],
    })

    // New due arises later → the scheduler should open a new cycle and send again.
    setDay(20)
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('payment_due_reminder')).toBe(2)
  })

  it('restarts reminders for a re-incurred due after the FIRST cycle ran to completion', async () => {
    // Regression: once a due cycle hits the 7-send cap, cancelReminderCycles used
    // to skip writing the 'cancelled' sentinel, so resolveDueCycleKey() returned
    // null forever and a later re-incurred due got no reminders.
    const m = addMember({ pending_amount: 500 })

    // Run long enough for the cycle to reach its 7-send cap.
    for (let day = 0; day < 40; day++) {
      setDay(day)
      await runDailyWhatsAppAutomation()
    }
    expect(sendCountFor('payment_due_reminder')).toBe(7)

    // Member clears the due (due-cleared endpoint) even though the cycle is done.
    m.pending_amount = 0
    await cancelReminderCycles({
      gymId: 'gym-1', memberId: m.id, phone: m.phone,
      templates: ['payment_due_reminder'],
    })
    expect(logsFor('payment_due_reminder').some(r => r.status === 'cancelled')).toBe(true)

    // Later the member owes again → a fresh cycle must open and send.
    m.pending_amount = 800
    setDay(60)
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('payment_due_reminder')).toBe(8)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Expiry cadence + renewal cancellation
// ═══════════════════════════════════════════════════════════════════════════

describe('membership_expiry_reminder', () => {
  it('reminds every 3 days while inside the expiry window', async () => {
    // Expires on day 18 → stays "expiring" across the whole 0..9 run.
    addMember({
      memberships: [{ plan: 'monthly', end_date: label(18), created_at: label(-30) }],
    })

    for (let day = 0; day < 10; day++) {
      setDay(day)
      await runDailyWhatsAppAutomation()
    }
    // Reminders on days 0, 3, 6, 9
    expect(sendCountFor('membership_expiry_reminder')).toBe(4)
  })

  it('stops reminding after the cycle is cancelled (e.g. renewal)', async () => {
    const m = addMember({
      memberships: [{ plan: 'monthly', end_date: label(18), created_at: label(-30) }],
    })

    setDay(0)
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('membership_expiry_reminder')).toBe(1)

    // Renewal cancels the active expiry cycle. The membership is STILL inside the
    // window, so only the cancellation can prevent further sends.
    await cancelReminderCycles({
      gymId: 'gym-1', memberId: m.id, phone: m.phone,
      templates: ['membership_expiry_reminder', 'membership_expired'],
    })

    for (let day = 3; day <= 9; day += 3) {
      setDay(day)
      await runDailyWhatsAppAutomation()
    }
    expect(sendCountFor('membership_expiry_reminder')).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Welcome idempotency + birthday
// ═══════════════════════════════════════════════════════════════════════════

describe('event-driven & annual sends', () => {
  it('sends the welcome message only once', async () => {
    addMember({ id: 'mem-1' })
    const args = {
      gymId: 'gym-1', gymName: 'Iron Temple', memberId: 'mem-1',
      memberName: 'Arjun', phone: '9876543210', plan: 'monthly', startDate: label(0),
    }
    await sendWelcomeMessage(args)
    await sendWelcomeMessage(args) // retry / double-submit
    expect(sendCountFor('_gymflow_welcome_member')).toBe(1)
  })

  it('sends a birthday wish once, only on the birthday', async () => {
    addMember({ date_of_birth: label(2).replace(/^\d{4}/, '1995') })

    // Not the birthday yet
    setDay(0)
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('_birthday_wishes')).toBe(0)

    // On the birthday — send once even if cron somehow runs twice
    setDay(2)
    await runDailyWhatsAppAutomation()
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('_birthday_wishes')).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════════════════

describe('runDailyWhatsAppAutomation stats', () => {
  it('reports processed/queued counts', async () => {
    addMember({ pending_amount: 500 })
    setDay(0)
    const stats = await runDailyWhatsAppAutomation()
    expect(stats.processed).toBe(1)
    expect(stats.queued).toBe(1)
    expect(stats.errors).toEqual([])
  })

  it('skips members with an invalid phone number', async () => {
    addMember({ id: 'mem-bad', phone: '123', pending_amount: 500 })
    setDay(0)
    const stats = await runDailyWhatsAppAutomation()
    expect(stats.processed).toBe(0)
    expect(sendCountFor('payment_due_reminder')).toBe(0)
  })
})
