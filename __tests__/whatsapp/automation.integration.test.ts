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
      whatsapp_send_queue: [] as any[],
      attendance: [] as any[],
      gym_gamification_settings: [] as any[],
    },
    sendMock: vi.fn(),
    /** null = the real enable-list (empty by default); an array = pretend these are enabled. */
    enabledGamification: null as string[] | null,
  }
})

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

  h.store.gyms = [{ id: 'gym-1', name: 'Iron Temple', onboarding_completed: true, is_active: true, subscription_status: 'active', whatsapp_enabled: true }]
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

// ═══════════════════════════════════════════════════════════════════════════
// The per-gym WhatsApp switch (gyms.whatsapp_enabled)
// ═══════════════════════════════════════════════════════════════════════════

describe('per-gym WhatsApp switch', () => {
  function addGym(id: string, whatsapp_enabled: boolean) {
    h.store.gyms.push({ id, name: id, onboarding_completed: true, is_active: true, subscription_status: 'active', whatsapp_enabled })
  }
  function addMemberTo(gymId: string, id: string) {
    h.store.members.push({
      id, gym_id: gymId, name: id, phone: '9876543210', date_of_birth: null, pending_amount: 500, memberships: [],
    })
  }

  it('sends the daily reminders of a gym that has WhatsApp on', async () => {
    addMember({ pending_amount: 500 })
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('payment_due_reminder')).toBe(1)
  })

  it('processes, queues and logs nothing for a gym with WhatsApp off', async () => {
    h.store.gyms[0].whatsapp_enabled = false
    addMember({ pending_amount: 500 })
    const stats = await runDailyWhatsAppAutomation()
    expect(stats.processed).toBe(0)
    expect(stats.queued).toBe(0)
    expect(h.sendMock).not.toHaveBeenCalled()
    expect(h.store.whatsapp_send_queue).toHaveLength(0)
    expect(h.store.whatsapp_automation_logs).toHaveLength(0)
  })

  it('switches off ONLY the gym that was switched off; other gyms keep sending', async () => {
    h.store.gyms = []
    addGym('gym-on', true)
    addGym('gym-off', false)
    addMemberTo('gym-on', 'mem-on')
    addMemberTo('gym-off', 'mem-off')
    await runDailyWhatsAppAutomation()
    const sentTo = h.sendMock.mock.calls.map(c => c[1].memberName)
    expect(sentTo).toEqual(['mem-on'])
  })

  it('a fixture gym with no switch value is not processed (the filter is an explicit = true)', async () => {
    delete h.store.gyms[0].whatsapp_enabled
    addMember({ pending_amount: 500 })
    // The daily query filters on whatsapp_enabled = true, which is what the real column holds
    // for every existing gym. A fixture row with no value mirrors none of them, so this only
    // pins that the filter is an explicit "= true" and an absent value is not sent.
    await runDailyWhatsAppAutomation()
    expect(h.sendMock).not.toHaveBeenCalled()
  })

  it('sends no welcome message for a gym with WhatsApp off, and leaves no log row', async () => {
    h.store.gyms[0].whatsapp_enabled = false
    addMember()
    await sendWelcomeMessage({
      gymId: 'gym-1', gymName: 'Iron Temple', memberId: 'mem-1', memberName: 'Arjun',
      phone: '9876543210', plan: 'Monthly', startDate: label(0),
    })
    expect(h.sendMock).not.toHaveBeenCalled()
    expect(h.store.whatsapp_automation_logs).toHaveLength(0)
  })

  it('sends the welcome message again once WhatsApp is switched back on', async () => {
    h.store.gyms[0].whatsapp_enabled = false
    addMember()
    const args = {
      gymId: 'gym-1', gymName: 'Iron Temple', memberId: 'mem-1', memberName: 'Arjun',
      phone: '9876543210', plan: 'Monthly', startDate: label(0),
    }
    await sendWelcomeMessage(args)
    h.store.gyms[0].whatsapp_enabled = true
    await sendWelcomeMessage(args)
    expect(sendCountFor('_gymflow_welcome_member')).toBe(1)
    // and the gym id travels with the send, so the sender's own check can see it
    expect(h.sendMock.mock.calls[0][1].gymId).toBe('gym-1')
  })

  it('an import batch for a gym with WhatsApp off sends nothing', async () => {
    h.store.gyms[0].whatsapp_enabled = false
    addMember({ pending_amount: 0 })
    const stats = await runImportBatchAutomation({ gymId: 'gym-1', memberIds: ['mem-1'] })
    expect(stats.queued).toBe(0)
    expect(stats.skipped).toBe(1)
    expect(h.sendMock).not.toHaveBeenCalled()
  })

  it('reminders resume after the switch is turned back on (a skipped send does not close the cycle)', async () => {
    h.store.gyms[0].whatsapp_enabled = false
    addMember({ pending_amount: 500 })
    setDay(0)
    await runDailyWhatsAppAutomation()
    h.store.gyms[0].whatsapp_enabled = true
    setDay(1)
    await runDailyWhatsAppAutomation()
    expect(sendCountFor('payment_due_reminder')).toBe(1)
  })

  it('a send that was already queued is stopped, not retried, when the gym is switched off', async () => {
    h.store.whatsapp_send_queue.push({
      id: 'q1', gym_id: 'gym-1', template_name: 'payment_due_reminder',
      context: { phone: '9876543210', gymName: 'Iron Temple', memberName: 'Arjun', dueAmount: 500 },
      log_row_id: null, attempts: 0, max_attempts: 3, status: 'pending',
      scheduled_at: new Date(Date.now() - 1000).toISOString(),
    })
    // Stand-in for sendTemplate's own check: what it returns for a gym that is switched off.
    const sender = vi.fn(async (_template: TemplateId, _ctx: TemplateContext): Promise<SendResult> => ({
      success: false, skipped: true, error: 'WhatsApp is turned off for this gym',
    }))
    const stats = await drainSendQueue({
      supabase: makeFakeClient() as any,
      sender,
      takeToken: async () => ({ success: true, remaining: 100 }),
      reschedule: async () => true,
    })
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender.mock.calls[0][1]).toMatchObject({ gymId: 'gym-1' })
    expect(h.store.whatsapp_send_queue[0].status).toBe('cancelled')
    expect(stats.retried).toBe(0)
    expect(stats.failed).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Gamification nudges (one more step of the daily run) + the prize message
// ═══════════════════════════════════════════════════════════════════════════

const NUDGES = ['gym_streak_at_risk', 'gym_weekly_goal_reached', 'gym_leaderboard_rank_up']
const NO_GAMIFICATION = { gyms: 0, queued: 0, streakAtRisk: 0, weeklyGoalReached: 0, rankUp: 0, skipped: 0, failed: 0 }

/** Check a member in on the given day offsets (relative to day 0), each saved at 10:00 IST that day. */
function attend(memberId: string, dayOffsets: number[], gymId = 'gym-1') {
  for (const n of dayOffsets) {
    const date = label(n)
    h.store.attendance.push({
      id: `att_${String(h.store.attendance.length + 1).padStart(5, '0')}`,
      member_id: memberId,
      gym_id: gymId,
      date,
      created_at: `${date}T04:30:00.000Z`,
    })
  }
}

function gamificationSends() {
  return h.sendMock.mock.calls.filter(c => String(c[0]).startsWith('gym_')).map(c => c[0])
}

describe('gamification nudges: off until a template is enabled', () => {
  it('queues, claims and sends nothing with the shipped (empty) enable-list', async () => {
    addMember()
    attend('mem-1', [-4, -3, -2, -1]) // a 4-day streak, the weekly goal, and nobody to beat
    const stats = await runDailyWhatsAppAutomation()
    expect(h.sendMock).not.toHaveBeenCalled()
    expect(h.store.whatsapp_send_queue).toHaveLength(0)
    expect(h.store.whatsapp_automation_logs).toHaveLength(0)
    expect(stats.gamification).toEqual(NO_GAMIFICATION)
    expect(stats.queued).toBe(0)
  })

  it('sends only the templates that are enabled', async () => {
    h.enabledGamification = ['gym_weekly_goal_reached']
    addMember()
    attend('mem-1', [-4, -3, -2, -1]) // streak applies too, but that template is not enabled
    await runDailyWhatsAppAutomation()
    expect(gamificationSends()).toEqual(['gym_weekly_goal_reached'])
    expect(logsFor('gym_streak_at_risk')).toHaveLength(0)
  })
})

describe('gamification nudges: the daily step', () => {
  beforeEach(() => { h.enabledGamification = [...NUDGES] })

  it('queues a streak-at-risk nudge through the send queue with the claim row attached', async () => {
    addMember()
    attend('mem-1', [-3, -2, -1])
    const stats = await runDailyWhatsAppAutomation()

    expect(stats.gamification).toEqual({ ...NO_GAMIFICATION, gyms: 1, queued: 1, streakAtRisk: 1 })
    expect(stats.queued).toBe(1)
    expect(stats.errors).toEqual([])

    // claimed in the automation log...
    const logs = logsFor('gym_streak_at_risk')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      gym_id: 'gym-1', member_id: 'mem-1', status: 'sent', send_count: 1,
      cycle_key: `gym_streak_at_risk:mem-1:${label(-1)}`,
    })
    // ...queued, not sent inline, and reconciled by the drain
    expect(h.store.whatsapp_send_queue).toHaveLength(1)
    expect(h.store.whatsapp_send_queue[0]).toMatchObject({
      gym_id: 'gym-1', member_id: 'mem-1', template_name: 'gym_streak_at_risk', log_row_id: logs[0].id, status: 'sent',
    })
    expect(logs[0].message_id).toMatch(/^wamid\./)

    // the gym id rides along so sendTemplate can check the gym's WhatsApp switch
    expect(h.sendMock).toHaveBeenCalledTimes(1)
    expect(h.sendMock.mock.calls[0][0]).toBe('gym_streak_at_risk')
    expect(h.sendMock.mock.calls[0][1]).toMatchObject({
      gymId: 'gym-1', gymName: 'Iron Temple', memberName: 'Arjun', phone: '9876543210', streakDays: 3,
    })
  })

  it('reports the real length of a streak longer than the first attendance window', async () => {
    addMember()
    attend('mem-1', Array.from({ length: 15 }, (_, i) => -(i + 1)))
    await runDailyWhatsAppAutomation()
    expect(h.sendMock.mock.calls[0][1].streakDays).toBe(15)
  })

  it('queues nothing on a second run the same day', async () => {
    addMember()
    attend('mem-1', [-4, -3, -2, -1])
    await runDailyWhatsAppAutomation()
    const again = await runDailyWhatsAppAutomation()
    expect(gamificationSends()).toEqual(['gym_streak_at_risk'])
    expect(again.gamification).toEqual({ ...NO_GAMIFICATION, gyms: 1 })
    expect(h.store.whatsapp_send_queue).toHaveLength(1)
  })

  it('does not double-send when a second run overlaps the first mid-send', async () => {
    addMember()
    attend('mem-1', [-3, -2, -1])
    let reentered = false
    h.sendMock.mockImplementationOnce(async (template: string) => {
      if (!reentered) {
        reentered = true
        await runDailyWhatsAppAutomation()
      }
      return { success: true, messageId: `wamid.${template}` }
    })
    await runDailyWhatsAppAutomation()
    expect(gamificationSends()).toEqual(['gym_streak_at_risk'])
  })

  it('sends one message per member per day, by priority: streak first, then rank the next day', async () => {
    addMember({ id: 'mem-1' })
    addMember({ id: 'mem-2', name: 'Bala' })
    attend('mem-1', [-4, -3, -2, -1]) // streak 4 + weekly goal 4 + alone at #1
    attend('mem-2', [-1])

    setDay(0)
    await runDailyWhatsAppAutomation()
    expect(gamificationSends()).toEqual(['gym_streak_at_risk'])
    expect(logsFor('gym_weekly_goal_reached')).toHaveLength(0)
    expect(logsFor('gym_leaderboard_rank_up')).toHaveLength(0)

    // Next morning, no new check-in: the streak is gone, the goal message is no longer
    // fresh, and mem-1 still leads the board.
    setDay(1)
    await runDailyWhatsAppAutomation()
    expect(gamificationSends()).toEqual(['gym_streak_at_risk', 'gym_leaderboard_rank_up'])
    expect(h.sendMock.mock.calls[1][1]).toMatchObject({ memberName: 'Arjun', rank: 1, boardName: 'last 7 days' })

    // Still #1 the day after: not told again within 7 days.
    setDay(2)
    await runDailyWhatsAppAutomation()
    expect(gamificationSends()).toHaveLength(2)
  })

  it('uses the gym\'s weekly goal from its settings row', async () => {
    h.enabledGamification = ['gym_weekly_goal_reached']
    h.store.gym_gamification_settings.push({ gym_id: 'gym-1', leaderboards_enabled: true, weekly_goal_days: 2 })
    addMember()
    attend('mem-1', [-2, -1])
    await runDailyWhatsAppAutomation()
    expect(gamificationSends()).toEqual(['gym_weekly_goal_reached'])
    expect(h.sendMock.mock.calls[0][1]).toMatchObject({ daysAttended: 2 })
  })

  it('skips a member with an invalid phone number', async () => {
    addMember({ phone: '123' })
    attend('mem-1', [-3, -2, -1])
    const stats = await runDailyWhatsAppAutomation()
    expect(h.sendMock).not.toHaveBeenCalled()
    expect(stats.gamification.queued).toBe(0)
  })

  it('does not disturb the reminders: a due reminder and a nudge both go out', async () => {
    addMember({ pending_amount: 500 })
    attend('mem-1', [-3, -2, -1])
    const stats = await runDailyWhatsAppAutomation()
    expect(h.sendMock.mock.calls.map(c => c[0]).sort()).toEqual(['gym_streak_at_risk', 'payment_due_reminder'])
    expect(stats.queued).toBe(2)
  })
})

describe('gamification nudges: gym switches', () => {
  beforeEach(() => { h.enabledGamification = [...NUDGES] })

  it('queues, claims and sends nothing for a gym with WhatsApp switched off', async () => {
    h.store.gyms[0].whatsapp_enabled = false
    addMember()
    attend('mem-1', [-3, -2, -1])
    const stats = await runDailyWhatsAppAutomation()
    expect(h.sendMock).not.toHaveBeenCalled()
    expect(h.store.whatsapp_send_queue).toHaveLength(0)
    expect(h.store.whatsapp_automation_logs).toHaveLength(0)
    expect(stats.gamification).toEqual(NO_GAMIFICATION)
  })

  it('queues, claims and sends nothing for a gym with leaderboards switched off', async () => {
    h.store.gym_gamification_settings.push({ gym_id: 'gym-1', leaderboards_enabled: false, weekly_goal_days: 4 })
    addMember()
    attend('mem-1', [-4, -3, -2, -1])
    const stats = await runDailyWhatsAppAutomation()
    expect(h.sendMock).not.toHaveBeenCalled()
    expect(h.store.whatsapp_send_queue).toHaveLength(0)
    expect(h.store.whatsapp_automation_logs).toHaveLength(0)
    expect(stats.gamification).toEqual(NO_GAMIFICATION)
  })

  it('a gym with no settings row uses the defaults (leaderboards on)', async () => {
    addMember()
    attend('mem-1', [-3, -2, -1])
    const stats = await runDailyWhatsAppAutomation()
    expect(stats.gamification.gyms).toBe(1)
    expect(gamificationSends()).toEqual(['gym_streak_at_risk'])
  })

  it('skips ONLY the gyms that are switched off; the others still get their nudges', async () => {
    const gym = (id: string, whatsapp_enabled: boolean) =>
      ({ id, name: id, onboarding_completed: true, is_active: true, subscription_status: 'active', whatsapp_enabled })
    h.store.gyms.push(gym('gym-no-boards', true), gym('gym-no-whatsapp', false))
    h.store.gym_gamification_settings.push({ gym_id: 'gym-no-boards', leaderboards_enabled: false, weekly_goal_days: 4 })

    addMember({ id: 'mem-1' })
    for (const [id, gymId] of [['mem-b', 'gym-no-boards'], ['mem-w', 'gym-no-whatsapp']]) {
      h.store.members.push({ id, gym_id: gymId, name: id, phone: '9876543210', date_of_birth: null, pending_amount: 0, memberships: [] })
      attend(id, [-3, -2, -1], gymId)
    }
    attend('mem-1', [-3, -2, -1])

    const stats = await runDailyWhatsAppAutomation()
    expect(h.sendMock.mock.calls.map(c => [c[0], c[1].memberName])).toEqual([['gym_streak_at_risk', 'Arjun']])
    expect(stats.gamification.gyms).toBe(1)
  })

  it('reads attendance of the gym being processed only', async () => {
    // A row for mem-1 filed under another gym must not extend mem-1's streak here.
    addMember()
    attend('mem-1', [-2, -1])
    attend('mem-1', [-3], 'some-other-gym')
    await runDailyWhatsAppAutomation()
    expect(logsFor('gym_streak_at_risk')).toHaveLength(0)
  })
})

describe('gym_prize_awarded (event send)', () => {
  const args = { gymId: 'gym-1', memberId: 'mem-1', prize: 'Free protein shaker', periodLabel: 'Last 7 days', board: 'week' }

  it('sends nothing and writes nothing while the template is not enabled (the default)', async () => {
    addMember()
    const result = await sendPrizeAwardedMessage(args)
    expect(result).toEqual({ sent: false, reason: 'template_disabled' })
    expect(h.sendMock).not.toHaveBeenCalled()
    expect(h.store.whatsapp_automation_logs).toHaveLength(0)
  })

  describe('once enabled', () => {
    beforeEach(() => { h.enabledGamification = ['gym_prize_awarded'] })

    it('claims, sends inline with the gym id, and records the message id', async () => {
      addMember()
      const result = await sendPrizeAwardedMessage(args)
      expect(result).toEqual({ sent: true })
      expect(h.sendMock).toHaveBeenCalledTimes(1)
      expect(h.sendMock.mock.calls[0][0]).toBe('gym_prize_awarded')
      expect(h.sendMock.mock.calls[0][1]).toMatchObject({
        gymId: 'gym-1', gymName: 'Iron Temple', memberName: 'Arjun', phone: '9876543210',
        prize: 'Free protein shaker', periodLabel: 'Last 7 days',
      })
      const logs = logsFor('gym_prize_awarded')
      expect(logs).toHaveLength(1)
      expect(logs[0]).toMatchObject({ status: 'sent', cycle_key: 'gym_prize_awarded:mem-1:week:Last 7 days' })
      expect(logs[0].message_id).toMatch(/^wamid\./)
      expect(h.store.whatsapp_send_queue).toHaveLength(0) // event send: not queued
    })

    it('sends once for the same member, board and period, even on a later day', async () => {
      addMember()
      await sendPrizeAwardedMessage(args)
      expect(await sendPrizeAwardedMessage(args)).toEqual({ sent: false, reason: 'already_sent' })
      setDay(3)
      expect(await sendPrizeAwardedMessage(args)).toEqual({ sent: false, reason: 'already_sent' })
      expect(sendCountFor('gym_prize_awarded')).toBe(1)
    })

    it('survives a double tap racing mid-send', async () => {
      addMember()
      let reentered = false
      h.sendMock.mockImplementationOnce(async (template: string) => {
        if (!reentered) {
          reentered = true
          await sendPrizeAwardedMessage(args)
        }
        return { success: true, messageId: `wamid.${template}` }
      })
      await sendPrizeAwardedMessage(args)
      expect(sendCountFor('gym_prize_awarded')).toBe(1)
    })

    it('sends nothing, and leaves no log row, for a gym with WhatsApp switched off', async () => {
      h.store.gyms[0].whatsapp_enabled = false
      addMember()
      expect(await sendPrizeAwardedMessage(args)).toEqual({ sent: false, reason: 'whatsapp_disabled' })
      expect(h.sendMock).not.toHaveBeenCalled()
      expect(h.store.whatsapp_automation_logs).toHaveLength(0)
    })

    it('does not message a member of another gym', async () => {
      h.store.gyms.push({ id: 'gym-2', name: 'Other', onboarding_completed: true, is_active: true, subscription_status: 'active', whatsapp_enabled: true })
      addMember() // mem-1 belongs to gym-1
      expect(await sendPrizeAwardedMessage({ ...args, gymId: 'gym-2' })).toEqual({ sent: false, reason: 'not_found' })
      expect(h.sendMock).not.toHaveBeenCalled()
    })

    it('skips a member with no usable phone number', async () => {
      addMember({ phone: '123' })
      expect(await sendPrizeAwardedMessage(args)).toEqual({ sent: false, reason: 'no_phone' })
      expect(h.sendMock).not.toHaveBeenCalled()
    })

    it('releases the slot on a transient failure so the owner can retry', async () => {
      addMember()
      h.sendMock.mockResolvedValueOnce({ success: false, error: 'network timeout' })
      expect(await sendPrizeAwardedMessage(args)).toMatchObject({ sent: false, reason: 'send_failed' })
      expect(await sendPrizeAwardedMessage(args)).toEqual({ sent: true })
    })
  })
})

describe('3-month reminder window (import batch)', () => {
  it('skips a long-expired member but still queues a recently expired one', async () => {
    addMember({ id: 'old', memberships: [{ plan: 'monthly', end_date: label(-120), created_at: label(-150) }] })
    addMember({ id: 'recent', memberships: [{ plan: 'monthly', end_date: label(-10), created_at: label(-40) }] })
    await runImportBatchAutomation({ gymId: 'gym-1', memberIds: ['old', 'recent'] })
    const queued = h.store.whatsapp_send_queue.map((r: any) => r.member_id)
    expect(queued).toEqual(['recent'])
  })
})
