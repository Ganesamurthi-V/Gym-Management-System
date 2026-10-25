import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { importMaxRowsForDisplay, importRowsToTake, memberCapReached } from '@/lib/subscription-utils'

const read = (p: string) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n')

describe('importMaxRowsForDisplay', () => {
  it('shows the remaining room on trial', () => {
    expect(importMaxRowsForDisplay('trial', 0)).toBe(50)
    expect(importMaxRowsForDisplay('trial', 30)).toBe(20)
    expect(importMaxRowsForDisplay('trial', 50)).toBe(0)
    expect(importMaxRowsForDisplay('trial', 400)).toBe(0)
  })
  it('shows the remaining room on Free', () => {
    expect(importMaxRowsForDisplay('free', 0)).toBe(50)
    expect(importMaxRowsForDisplay('free', 30)).toBe(20)
    expect(importMaxRowsForDisplay('free', 50)).toBe(0)
    expect(importMaxRowsForDisplay('free', 80)).toBe(0)
  })
  it('has no cap on paid or unknown plans', () => {
    expect(importMaxRowsForDisplay('monthly', 10)).toBeNull()
    expect(importMaxRowsForDisplay('yearly', 10)).toBeNull()
    expect(importMaxRowsForDisplay(null, 10)).toBeNull()
    expect(importMaxRowsForDisplay(undefined, 10)).toBeNull()
  })
  it('agrees with what the confirm route would take', () => {
    for (const [plan, n] of [['trial', 5], ['free', 30], ['free', 50]] as const) {
      expect(importMaxRowsForDisplay(plan, n)).toBe(importRowsToTake(plan, n, 1_000_000))
    }
  })
})

describe('import limits and subscription request routes (source checks)', () => {
  it('limits route is withAuth, GET only, scoped by the resolved gym and checks errors', () => {
    const s = read('app/api/import/limits/route.ts')
    expect(s).toContain("withAuth('IMPORT_LIMITS_GET'")
    expect(s).toContain('export const GET')
    expect(s).not.toMatch(/export const (POST|PUT|PATCH|DELETE)/)
    expect(s).toContain('.eq(\'id\', gym.id)')
    expect(s).toContain(".eq('gym_id', gym.id)")
    expect(s).toContain('planRes.error || countRes.error')
  })
  it('request route validates plan, stores it, and gates the add-on on the DB plan', () => {
    const s = read('app/api/subscription/request/route.ts')
    expect(s).toContain("z.enum(['monthly', 'yearly', 'whatsapp_addon'])")
    expect(s).toContain('plan_requested: planRequested')
    expect(s).toContain("gymPlan.plan_type !== 'free'")
    expect(s).toContain('status: 403')
  })
})

describe('whole-gym import cap (source checks)', () => {
  // withAuth-free route that needs a live Supabase client, so these assert the source
  // rather than mocking the client chain.
  it('confirm returns PLAN_MEMBER_LIMIT 403 when nothing fits and for a concurrent-import DB cap error', () => {
    const s = read('app/api/import/confirm/route.ts')
    expect(s).toContain("code: 'PLAN_MEMBER_LIMIT'")
    expect(s).toContain('{ status: 403 }')
    expect(s).toContain('take === 0 && allRows.length > 0')
    expect(s).toContain("insertErr.code === '23514'")
    expect(s).toContain("insertErr.message?.includes('member_limit')")
    // the expected cap case must return before the failure alert
    const cap = s.indexOf("includes('member_limit')")
    expect(cap).toBeGreaterThan(-1)
    expect(cap).toBeLessThan(s.indexOf("alertFailure('member_insert')"))
  })
  it('canonical schema and the latest migration cap EVERY trial insert (manual adds too) in the trigger function', () => {
    for (const f of ['supabase-schema.sql', 'supabase/migrations/20261027100000_trial_member_cap_all_inserts.sql']) {
      const s = read(f)
      expect(s).toContain('trial_member_limit')
      expect(s).not.toContain('trial_import_member_limit')
      expect(s).not.toContain('NEW.is_imported IS TRUE')
      expect(s).toContain('free_plan_member_limit')
      expect(s).toContain('FOR UPDATE')
    }
  })
})

describe('memberCapReached', () => {
  it('caps trial and free at 50', () => {
    for (const plan of ['trial', 'free']) {
      expect(memberCapReached(plan, 49)).toBe(false)
      expect(memberCapReached(plan, 50)).toBe(true)
      expect(memberCapReached(plan, 51)).toBe(true)
    }
  })
  it('never caps paid or unknown plans', () => {
    for (const plan of ['monthly', 'quarterly', 'yearly', 'lifetime', null, undefined]) {
      expect(memberCapReached(plan, 500)).toBe(false)
    }
  })
})

describe('POST /api/members enforces the cap (source checks)', () => {
  const s = read('app/api/members/route.ts')
  it('reads the plan and count from the DB for the resolved gym and returns 403 before inserting', () => {
    expect(s).toContain('memberCapReached(')
    expect(s).toContain(".eq('gym_id', gym.id)")
    expect(s).toContain("code: 'PLAN_MEMBER_LIMIT'")
    expect(s.indexOf('memberCapReached(')).toBeLessThan(s.indexOf("DB_INSERT')"))
    expect(s).not.toContain('FREE_PLAN_LIMIT')
  })
  it('maps a race-loser DB cap error to the same response', () => {
    expect(s).toContain("error.message?.includes('member_limit')")
  })
})
