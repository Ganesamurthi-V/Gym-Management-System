import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { importMaxRowsForDisplay, importRowsToTake } from '@/lib/subscription-utils'

const read = (p: string) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n')

describe('importMaxRowsForDisplay', () => {
  it('shows the fixed row cap on trial', () => {
    expect(importMaxRowsForDisplay('trial', 0)).toBe(50)
    expect(importMaxRowsForDisplay('trial', 400)).toBe(50)
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
