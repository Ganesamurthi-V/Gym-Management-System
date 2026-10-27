import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const files = {
  migration: read('supabase/migrations/20261030100000_member_push.sql'),
  schema: read('supabase-schema.sql'),
}
const fns = ['register_push_subscription(TEXT, TEXT, TEXT, TEXT)', 'unregister_push_subscription(TEXT)']

function body(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`)
  expect(start).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('\n$$;', start))
}

for (const [label, sql] of Object.entries(files)) {
  describe(`member_push_subscriptions in ${label}`, () => {
    it('has RLS on and no policies at all', () => {
      expect(sql).toMatch(/ALTER TABLE member_push_subscriptions\s+ENABLE ROW LEVEL SECURITY/)
      expect(sql).not.toMatch(/CREATE POLICY[^;]*member_push_subscriptions/)
    })
    it('grants nothing on the table', () => {
      expect(sql).toMatch(/REVOKE ALL ON public\.member_push_subscriptions FROM PUBLIC, anon, authenticated/)
      expect(sql).not.toMatch(/GRANT[^;]*ON (TABLE )?(public\.)?member_push_subscriptions/)
    })
    it('has the same-gym composite FK, the indexes and the endpoint limit', () => {
      expect(sql).toContain('fk_member_push_subscriptions_member_same_gym')
      expect(sql).toContain('idx_member_push_subscriptions_gym')
      expect(sql).toContain('idx_member_push_subscriptions_member')
      expect(sql).toMatch(/endpoint\s+TEXT\s+NOT NULL UNIQUE CHECK \(char_length\(endpoint\) <= 600\)/)
    })
    for (const name of ['register_push_subscription', 'unregister_push_subscription']) {
      it(`${name} is SECURITY DEFINER, search_path '', uses auth.uid(), gated, takes no ids`, () => {
        const fn = body(sql, name)
        expect(fn).toMatch(/SECURITY DEFINER/)
        expect(fn).toMatch(/SET search_path = ''/)
        expect(fn).toMatch(/auth_user_id = auth\.uid\(\)/)
        expect(fn).toMatch(/member_app_allowed\(\)/)
        expect(fn).not.toMatch(/p_(gym|member)_id/)
      })
    }
    for (const f of fns) {
      it(`${f} is revoked from PUBLIC/anon and granted to authenticated only`, () => {
        expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon;`)
        expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${f} TO authenticated;`)
        expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION public.${f} TO anon`)
      })
    }
  })
}
