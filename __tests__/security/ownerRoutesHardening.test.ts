/**
 * Source-level regression tests for the owner API route hardening
 * (tenant scope, CSRF, validation, money integrity, error leakage).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const read = (p: string) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n')

describe('shared guard', () => {
  const s = read('app/api/_guard.ts')
  it('mirrors the withAuth CSRF rule and never returns raw 5xx database text', () => {
    expect(s).toContain("'x-requested-with'")
    expect(s).toContain("origin === 'null'")
    expect(s).toContain('mapped.status >= 500')
  })
  it('rejects impossible calendar dates', () => {
    expect(s).toContain("toISOString().slice(0, 10) === value")
  })
})

describe('non-withAuth state-changing routes check CSRF', () => {
  const routes = [
    'app/api/payments/route.ts',
    'app/api/members/route.ts',
    'app/api/members/[id]/route.ts',
    'app/api/inventory/delete/route.ts',
    'app/api/inventory/sell/route.ts',
    'app/api/inventory/sales/[id]/route.ts',
    'app/api/inventory/[id]/route.ts',
    'app/api/programs/route.ts',
    'app/api/programs/assignments/route.ts',
    'app/api/support/clear/route.ts',
    'app/api/support/ticket/route.ts',
    'app/api/member-app/invite/route.ts',
    'app/api/onboarding/complete/route.ts',
  ]
  for (const r of routes) {
    it(r, () => expect(read(r)).toContain('passesCsrf(req)'))
  }
})

describe('tenant scope on writes by request-supplied id', () => {
  it('member PATCH/DELETE constrain the statement by gym_id', () => {
    const s = read('app/api/members/[id]/route.ts')
    expect(s).toContain(".update(updates)\n      .eq('id', id)\n      .eq('gym_id', gym.id)")
    expect(s).toContain(".from('members').delete().eq('id', id).eq('gym_id', gym.id)")
    expect(s).toContain(".from('attendance').delete().eq('member_id', id).eq('gym_id', gym.id)")
  })
  it('bulk member delete scopes related rows by gym_id', () => {
    const s = read('app/api/members/bulk/route.ts')
    expect(s).toContain(".from('attendance').delete().in('member_id', ids).eq('gym_id', gym.id)")
    expect(s).toContain(".from('memberships').delete().in('member_id', ids).eq('gym_id', gym.id)")
  })
  it('dues routes scope the member update by gym_id', () => {
    for (const p of ['app/api/dues/collect/route.ts', 'app/api/dues/mark-paid/route.ts']) {
      const s = read(p)
      expect(s).toMatch(/\.update\(\{ pending_amount: [^}]+\}\)\s*\.eq\('id', member_id\)\s*\.eq\('gym_id', gym\.id\)/)
    }
  })
  it('inventory unit PATCH requires the unit to belong to this gym and product', () => {
    const s = read('app/api/inventory/units/route.ts')
    expect(s).toContain(".from('inventory_units')\n    .select('id, status')\n    .eq('id', unit_id)\n    .eq('inventory_id', inventory_id)\n    .eq('gym_id', gym.id)")
  })
  it('inventory delete / update are scoped by gym_id', () => {
    expect(read('app/api/inventory/delete/route.ts')).toContain(".eq('id', inventoryId)\n      .eq('gym_id', gym.id)")
    expect(read('app/api/inventory/[id]/route.ts')).toContain(".update(updates)\n      .eq('id', id)\n      .eq('gym_id', gym.id)")
  })
  it('payments POST verifies the member belongs to the gym', () => {
    expect(read('app/api/payments/route.ts')).toContain(".eq('id', body.member_id)\n      .eq('gym_id', gym.id)")
  })
})

describe('money and stock integrity', () => {
  it('dues collection uses an optimistic lock and restores the balance if the ledger insert fails', () => {
    const s = read('app/api/dues/collect/route.ts')
    expect(s).toContain(".eq('pending_amount', currentPending)")
    expect(s).toContain('ledgerError')
    expect(s).toContain("code: 'NOTHING_DUE'")
  })
  it('unit status changes move stock once per transition', () => {
    const s = read('app/api/inventory/units/route.ts')
    expect(s).toContain('if (unit.status === status)')
    expect(s).toContain(".eq('status', unit.status)")
  })
  it('sale delete removes and reads back in one statement, then checks the stock restore', () => {
    const s = read('app/api/inventory/sales/[id]/route.ts')
    expect(s).toContain(".select('id, quantity, inventory_id')")
    expect(s).toContain('restoreError')
  })
  it('sell requires a whole-number quantity and bounds the price', () => {
    const s = read('app/api/inventory/sell/route.ts')
    expect(s).toContain('boundedInt(body.quantity, 1, 10_000)')
    expect(s).toContain('boundedNumber(customUnitPrice, 0, MAX_MONEY)')
    expect(s).toContain(".eq('initial_stock', product.initial_stock)")
  })
  it('memberships and payments reject negative or unbounded money', () => {
    const m = read('app/api/memberships/route.ts')
    expect(m).toContain('boundedInt(body.admission_fee, 0, MAX_MONEY)')
    expect(m).toContain('boundedInt(body.due_amount, 0, MAX_MONEY)')
    expect(read('app/api/payments/route.ts')).toContain('boundedInt(body.amount, 0, MAX_MONEY)')
  })
  it('inventory create/update validate every column', () => {
    for (const p of ['app/api/inventory/route.ts', 'app/api/inventory/[id]/route.ts']) {
      const s = read(p)
      expect(s).toContain('boundedNumber(')
      expect(s).toContain('MAX_STOCK')
    }
  })
})

describe('input validation', () => {
  it('assignment routes validate and bound memberIds', () => {
    const s = read('app/api/programs/assignments/route.ts')
    expect(s).toContain('MAX_MEMBER_IDS')
    expect(s).toContain('UUID_RE.test(v)')
    expect(s).toContain('checkRateLimit')
  })
  it('bulk member updates are a typed allowlist', () => {
    const s = read('app/api/members/bulk/route.ts')
    expect(s).toContain("boundedInt(update.pending_amount, 0, 10_000_000)")
    expect(s).toContain('boundedText(update.name, 100)')
  })
  it('onboarding blocks member logins and validates plans', () => {
    const s = read('app/api/onboarding/complete/route.ts')
    expect(s).toContain("roleFromClaims(user) === 'member'")
    expect(s).toContain('planError')
  })
  it('list endpoints clamp limit/offset', () => {
    expect(read('app/api/members/route.ts')).toContain('Math.max(parseInt(searchParams.get(\'offset\')')
    expect(read('app/api/payments/route.ts')).toContain("|| 50, 1), 100)")
    expect(read('app/api/programs/route.ts')).toContain('|| 100, 1), 200)')
  })
  it('support text is length-capped and clear ids are UUIDs', () => {
    expect(read('app/api/support/ticket/route.ts')).toContain('message.length > 5000')
    expect(read('app/api/support/clear/route.ts')).toContain('UUID_RE.test(id)')
  })
  it('invite is rate limited below the default (it sends WhatsApp)', () => {
    expect(read('app/api/member-app/invite/route.ts')).toContain("'/api/member-app/invite', 10)")
  })
})

describe('date handling', () => {
  it('expiring uses the real month end, not -31, and IST today', () => {
    const s = read('app/api/dashboard/expiring/route.ts')
    expect(s).not.toContain("${currentMonth}-31")
    expect(s).toContain('istToday()')
  })
  it('daily report uses the IST day window and checks query errors', () => {
    const s = read('app/api/dashboard/daily-report/route.ts')
    expect(s).toContain('+05:30')
    expect(s).toContain('membershipsRes.error')
  })
})

describe('no raw database or exception text reaches the client', () => {
  const files = [
    'app/api/dues/collect/route.ts', 'app/api/dues/mark-paid/route.ts', 'app/api/memberships/route.ts',
    'app/api/members/bulk/route.ts', 'app/api/members/[id]/route.ts', 'app/api/inventory/route.ts',
    'app/api/inventory/[id]/route.ts', 'app/api/inventory/units/route.ts', 'app/api/inventory/sell/route.ts',
    'app/api/inventory/delete/route.ts', 'app/api/inventory/sales/[id]/route.ts',
    'app/api/programs/assignments/route.ts', 'app/api/support/clear/route.ts', 'app/api/support/ticket/route.ts',
    'app/api/dashboard/expiring/route.ts',
  ]
  for (const f of files) {
    it(f, () => {
      const s = read(f)
      expect(s).not.toMatch(/message: (updateError|insertError|error|salesError|stockError|deleteError)\.message/)
      expect(s).not.toMatch(/error: (error|insertErr|salesError|stockError|deleteError)\.message/)
      expect(s).not.toMatch(/err instanceof Error \? err\.message/)
      expect(s).not.toMatch(/error\.message \|\| /)
    })
  }
  it('mapSupabaseError / handleSupabaseError in owner routes come from the no-leak guard', () => {
    for (const f of ['app/api/payments/route.ts', 'app/api/members/route.ts', 'app/api/programs/route.ts']) {
      expect(read(f)).toContain("from '@/app/api/_guard'")
      expect(read(f)).not.toContain("from '@/lib/utils/errorMapper'")
    }
    for (const f of ['app/api/gamification/events/route.ts', 'app/api/gamification/events/[id]/route.ts', 'app/api/gamification/events/[id]/give/route.ts']) {
      expect(read(f)).toContain("import { handleSupabaseError } from '@/app/api/_guard'")
    }
  })
})
