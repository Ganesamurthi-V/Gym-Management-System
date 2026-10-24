/**
 * Review fixes on the Free plan: the trial's 50-member coverage must break created_at ties
 * (bulk imports share one timestamp), and the Free switch must not reactivate a gym an admin
 * suspended or cancelled.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { getTrialEligibleMemberIds } from '@/lib/member/trialEligibility'

function fakeDb(rows: Array<{ id: string }>, error: unknown = null) {
  const calls: Array<[string, ...unknown[]]> = []
  const q: any = {
    select: (...a: unknown[]) => { calls.push(['select', ...a]); return q },
    eq: (...a: unknown[]) => { calls.push(['eq', ...a]); return q },
    order: (...a: unknown[]) => { calls.push(['order', ...a]); return q },
    limit: async (...a: unknown[]) => { calls.push(['limit', ...a]); return { data: error ? null : rows, error } },
  }
  return { db: { from: (t: string) => { calls.push(['from', t]); return q } } as any, calls }
}

describe('getTrialEligibleMemberIds', () => {
  it('orders by created_at then id and takes the first 50 of the gym', async () => {
    const { db, calls } = fakeDb([{ id: 'a' }, { id: 'b' }])
    const ids = await getTrialEligibleMemberIds(db, 'gym-1')
    expect([...ids]).toEqual(['a', 'b'])
    expect(calls).toContainEqual(['eq', 'gym_id', 'gym-1'])
    const orders = calls.filter(c => c[0] === 'order').map(c => c[1])
    // id as the tie-breaker is the fix: a 50-row import shares one created_at.
    expect(orders).toEqual(['created_at', 'id'])
    expect(calls).toContainEqual(['limit', 50])
  })

  it('throws on a query error so callers fail closed', async () => {
    const { db } = fakeDb([], { message: 'boom' })
    await expect(getTrialEligibleMemberIds(db, 'gym-1')).rejects.toBeTruthy()
  })

  it('the member app gate and the WhatsApp cron both use it', () => {
    expect(fs.readFileSync('lib/member/member-data.ts', 'utf8')).toContain('getTrialEligibleMemberIds')
    const automation = fs.readFileSync('lib/whatsapp/automation.ts', 'utf8')
    expect(automation).toContain('getTrialEligibleMemberIds')
    expect(automation).not.toContain('isAppEligibleRank(gym.plan_type, rank)')
  })
})

describe('owner_switch_to_free refuses suspended or cancelled gyms', () => {
  const guard = "v_active IS NOT TRUE OR v_status NOT IN ('trial', 'expired')"
  it('canonical schema', () => {
    expect(fs.readFileSync('supabase-schema.sql', 'utf8')).toContain(guard)
  })
  it('upgrade migration', () => {
    expect(fs.readFileSync('supabase/migrations/20261026110000_free_switch_status_guard.sql', 'utf8')).toContain(guard)
  })
})
