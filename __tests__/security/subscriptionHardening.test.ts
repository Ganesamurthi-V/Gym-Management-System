import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PLAN_MEMBER_LIMIT } from '@/lib/subscription-utils'

// Source-level guard for the subscription hardening migration: one gym per owner,
// the member app gate in the database, atomic paid approval, the expected amount on
// payment requests, login_disabled mirroring is_active, and the single sources for
// the member limit and the add-on price. Reads the SQL text; nothing is executed.
const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n')
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '')

const SCHEMA = read('supabase-schema.sql')
const MIGRATION = read('supabase/migrations/20261026130000_subscription_hardening.sql')
const FILES = { canonical: SCHEMA, migration: MIGRATION } as const

/** The CREATE FUNCTION statement for `name`, from its header to the closing `$$;`. */
function fnSource(sql: string, name: string): string {
  const header = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`, 'g')
  const matches = [...sql.matchAll(header)]
  expect(matches, `${name} must be defined exactly once`).toHaveLength(1)
  const start = matches[0].index!
  const end = sql.indexOf('\n$$;', start)
  expect(end, `${name} has no closing $$;`).toBeGreaterThan(start)
  return sql.slice(start, end + 4)
}

/** The CREATE POLICY statement for `name`, up to its terminating `);`. */
function policySource(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE POLICY "${name}"`)
  expect(start, `policy "${name}" missing`).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf(');\n', start) + 2)
}

const MEMBER_POLICIES = [
  'Members can view their own attendance',
  'Members can view their own memberships',
  'Members can view their own achievements',
  'Members can view their own activity',
  'Members can insert their own login activity',
  'Members can view their own assignments',
  'Members can view their gym programs',
]

const MEMBER_RPCS = [
  'get_member_gamification',
  'get_gym_leaderboard',
  'get_member_events',
  'set_leaderboard_visibility',
  'record_member_achievements',
  'record_member_login',
]

for (const [label, raw] of Object.entries(FILES)) {
  const sql = stripComments(raw)

  describe(`subscription hardening (${label})`, () => {
    it('F: one gym per owner and members.gym_id is guarded', () => {
      expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_gyms_owner_id ON public\.gyms\(owner_id\)/)
      expect(fnSource(raw, 'guard_members_gym_id')).toMatch(/NOT public\.is_trusted_db_caller\(\)/)
      expect(sql).toMatch(/CREATE TRIGGER trg_guard_members_gym_id\s+BEFORE UPDATE OF gym_id ON public\.members/)
    })

    it('H: approve_plan_payment is service-role only', () => {
      expect(fnSource(raw, 'approve_plan_payment')).toMatch(/SECURITY DEFINER\s+SET search_path = ''/)
      expect(sql).toMatch(
        /REVOKE ALL ON FUNCTION public\.approve_plan_payment\(UUID, UUID, TEXT, TEXT\) FROM PUBLIC, anon, authenticated;/,
      )
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.approve_plan_payment\(UUID, UUID, TEXT, TEXT\) TO service_role;/)
    })

    it('H: approve_plan_payment refuses to downgrade a Lifetime gym', () => {
      expect(fnSource(raw, 'approve_plan_payment')).toMatch(
        /v_gym\.plan_type = 'lifetime' AND p_plan <> 'lifetime'[\s\S]*?RAISE EXCEPTION 'already_lifetime' USING ERRCODE = 'P0001'/,
      )
    })

    it('I: expected_amount_inr is stamped by a BEFORE INSERT trigger', () => {
      expect(sql).toMatch(/expected_amount_inr INTEGER/)
      expect(fnSource(raw, 'set_subscription_request_expected_amount')).toMatch(/NEW\.expected_amount_inr :=/)
      expect(sql).toMatch(
        /CREATE TRIGGER trg_set_subscription_request_expected_amount\s+BEFORE INSERT ON public\.subscription_requests/,
      )
    })

    it('K: member_app_allowed exists and gates every member policy', () => {
      expect(fnSource(raw, 'member_app_allowed')).toMatch(/auth\.uid\(\)/)
      for (const name of MEMBER_POLICIES) {
        expect(policySource(sql, name), name).toContain('member_app_allowed')
      }
    })

    it('K: every member RPC raises member_app_not_allowed', () => {
      for (const name of MEMBER_RPCS) {
        expect(fnSource(raw, name), name).toContain('member_app_not_allowed')
      }
    })

    it('M: login_disabled is synced by a trigger that fires after the owner guard', () => {
      expect(fnSource(raw, 'sync_gyms_login_disabled')).toMatch(/NEW\.login_disabled := NOT COALESCE\(NEW\.is_active, true\)/)
      expect(sql).toMatch(/CREATE TRIGGER trg_sync_gyms_login_disabled/)
      // BEFORE triggers fire in name order: the sync must sort after the guard.
      expect('trg_sync_gyms_login_disabled' > 'trg_guard_gyms_privileged_columns').toBe(true)
    })

    it('N: plan_member_limit() and whatsapp_addon_price_inr are the single sources', () => {
      expect(sql).toContain('public.plan_member_limit()')
      expect(sql).toContain('whatsapp_addon_price_inr')
    })
  })
}

describe('canonical bodies carry no bare 50 limit', () => {
  for (const name of ['enforce_free_plan_member_cap', 'owner_switch_to_free', 'member_app_allowed']) {
    it(name, () => {
      const body = stripComments(fnSource(SCHEMA, name))
      expect(body).not.toMatch(/>=?\s*50\b/)
      expect(body).toContain('public.plan_member_limit()')
    })
  }

  it('approve_whatsapp_addon and the admin notification read the add-on price', () => {
    expect(stripComments(fnSource(SCHEMA, 'approve_whatsapp_addon'))).not.toMatch(/=\s*299\b/)
    expect(fnSource(SCHEMA, 'notify_on_subscription_request')).not.toContain('Rs 299')
    expect(fnSource(SCHEMA, 'notify_on_subscription_request')).toContain('whatsapp_addon_price_inr')
  })
})

describe('plan_member_limit() matches PLAN_MEMBER_LIMIT', () => {
  it('the SQL constant equals the TypeScript constant', () => {
    const m = fnSource(SCHEMA, 'plan_member_limit').match(/SELECT\s+(\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(PLAN_MEMBER_LIMIT)
  })
})
