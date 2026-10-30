import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const strip = (sql: string) => sql.replace(/--[^\n]*/g, '')
const schema = strip(readFileSync(join(process.cwd(), 'supabase-schema.sql'), 'utf8'))
const migration = strip(
  readFileSync(join(process.cwd(), 'supabase/migrations/20261028100000_gym_notices.sql'), 'utf8'),
)

function policies(sql: string) {
  return sql
    .split(/CREATE POLICY\s+/i)
    .slice(1)
    .map(c => c.split(/;\s*(?:\n|$)/)[0])
    .filter(p => /ON\s+gym_notices\b/i.test(p))
}

describe.each([['schema', schema], ['migration', migration]])('gym_notices (%s)', (_n, sql) => {
  const ps = policies(sql)

  it('enables RLS', () => {
    expect(sql).toMatch(/ALTER TABLE gym_notices\s+ENABLE ROW LEVEL SECURITY/i)
  })

  it('has four owner policies scoped to gym ownership', () => {
    const owner = ps.filter(p => /Owner can/i.test(p))
    expect(owner).toHaveLength(4)
    for (const p of owner) expect(p).toMatch(/owner_id = \(SELECT auth\.uid\(\)\)/i)
  })

  it('owner INSERT and UPDATE use WITH CHECK on ownership', () => {
    for (const verb of ['INSERT', 'UPDATE']) {
      const p = ps.find(x => new RegExp(`FOR ${verb}`, 'i').test(x))!
      expect(p).toMatch(/WITH CHECK\s*\(EXISTS \(SELECT 1 FROM gyms WHERE id = gym_notices\.gym_id/i)
    }
  })

  it('member policy is SELECT-only, scoped by current_member_gym_id and member_app_allowed', () => {
    const member = ps.filter(p => /Members can/i.test(p))
    expect(member).toHaveLength(1)
    expect(member[0]).toMatch(/FOR SELECT/i)
    expect(member[0]).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/i)
    expect(member[0]).toMatch(/current_member_gym_id\(\)/)
    expect(member[0]).toMatch(/member_app_allowed\(\)/)
  })

  it('no policy targets anon or public', () => {
    for (const p of ps) expect(p).not.toMatch(/TO\s+(anon|public)\b/i)
  })

  it('revokes from anon/PUBLIC and grants authenticated only', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.gym_notices FROM PUBLIC, anon, authenticated/i)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.gym_notices TO authenticated/i)
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.gym_notices TO (anon|PUBLIC)/i)
  })

  it('enforces the 20-active cap with a recognisable error', () => {
    expect(sql).toMatch(/TOO_MANY_NOTICES/)
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_guard_gym_notices_cap/i)
  })
})
