import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level invariants for the database layer. They run against the canonical
// schema file and the hardening migration, so a future edit that reopens one of
// these gaps fails here before it reaches the SQL editor.
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '')
const schema = stripComments(readFileSync(join(process.cwd(), 'supabase-schema.sql'), 'utf8'))
const migration = stripComments(
  readFileSync(join(process.cwd(), 'supabase/migrations/20261017120000_rls_hardening.sql'), 'utf8'),
)

type Fn = { name: string; text: string }
const functions: Fn[] = schema
  .split(/CREATE OR REPLACE FUNCTION\s+/i)
  .slice(1)
  .map(chunk => {
    const m = chunk.match(/^(?:public\.)?([a-z_0-9]+)\s*\(/i)
    return { name: m ? m[1] : '?', text: chunk }
  })

const definers = functions.filter(f => /SECURITY DEFINER/i.test(f.text))

describe('SECURITY DEFINER functions', () => {
  it('finds the definer functions at all', () => {
    expect(definers.length).toBeGreaterThan(20)
  })

  it('every one pins search_path, with pg_temp last whenever public is on the path', () => {
    for (const f of definers) {
      const sp = f.text.match(/SET search_path\s*=\s*([^\n;]+)/i)
      expect(sp, `${f.name}: no pinned search_path`).not.toBeNull()
      const value = sp![1].trim()
      if (/\bpublic\b/i.test(value)) {
        expect(value, `${f.name}: search_path with public must end in pg_temp`).toMatch(/pg_temp\s*$/i)
      } else {
        expect(value, `${f.name}: unexpected search_path`).toBe("''")
      }
    }
  })

  it('every one is explicitly revoked from PUBLIC', () => {
    for (const f of definers) {
      const re = new RegExp(
        `REVOKE\\s+(?:ALL|EXECUTE)\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${f.name}\\s*\\([^)]*\\)\\s+FROM\\s+PUBLIC`,
        'i',
      )
      expect(schema, `${f.name}: no REVOKE ... FROM PUBLIC`).toMatch(re)
    }
  })

  it('no function is revoked from anon alone (a no-op while PUBLIC holds the grant)', () => {
    expect(schema).not.toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION[^;]*FROM\s+anon\s*;/i)
  })
})

describe('row level security policies', () => {
  const policies = schema.match(/CREATE POLICY[^;]*;/gi) ?? []

  it('every UPDATE policy has WITH CHECK as well as USING', () => {
    const updates = policies.filter(p => /\bFOR UPDATE\b/i.test(p))
    expect(updates.length).toBeGreaterThan(15)
    for (const p of updates) {
      expect(p, p.slice(0, 80)).toMatch(/WITH CHECK/i)
    }
  })

  it('no policy is USING (true)', () => {
    for (const p of policies) {
      expect(p, p.slice(0, 80)).not.toMatch(/USING\s*\(\s*true\s*\)/i)
    }
  })

  it('no policy trusts user-editable metadata', () => {
    for (const p of policies) {
      expect(p, p.slice(0, 80)).not.toMatch(/user_metadata/i)
    }
  })

  it('platform_settings is readable by gym owners only', () => {
    const p = policies.find(x => /ON platform_settings/i.test(x))!
    expect(p).toMatch(/gyms[^;]*owner_id/i)
  })

  it('subscription_requests proof path is confined to the caller folder', () => {
    const p = policies.find(x => /ON public\.subscription_requests FOR INSERT/i.test(x))!
    expect(p).toMatch(/uploaded_file_url LIKE \(SELECT auth\.uid\(\)\)::text \|\| '\/%'/)
  })

  it('members can only log themselves as performed_by member', () => {
    const p = policies.find(x => /Members can insert their own login activity/i.test(x))!
    expect(p).toMatch(/performed_by = 'member'/)
  })

  it('storage policies are authenticated-only, owner-only and path-confined', () => {
    const storage = policies.filter(x => /ON storage\.objects/i.test(x))
    expect(storage.length).toBeGreaterThanOrEqual(2)
    for (const p of storage) {
      expect(p).toMatch(/TO authenticated/i)
      expect(p).toMatch(/storage\.foldername\(name\)\)\[1\] = \(SELECT auth\.uid\(\)\)::text/)
    }
    expect(schema).toMatch(/file_size_limit[\s\S]*?10485760/)
    expect(schema).toMatch(/allowed_mime_types/)
  })
})

describe('column guards and privileges', () => {
  it('the support_tickets guard fires on INSERT as well as UPDATE', () => {
    expect(schema).toMatch(
      /CREATE TRIGGER trg_guard_support_tickets_owner_update\s+BEFORE INSERT OR UPDATE ON public\.support_tickets/i,
    )
  })

  it('the gyms guard fires on INSERT and UPDATE', () => {
    expect(schema).toMatch(
      /CREATE TRIGGER trg_guard_gyms_privileged_columns\s+BEFORE INSERT OR UPDATE ON public\.gyms/i,
    )
  })

  it('anon is stripped of table privileges and API roles of TRUNCATE', () => {
    expect(schema).toMatch(/REVOKE ALL ON public\.%I FROM PUBLIC, anon/)
    expect(schema).toMatch(/REVOKE TRUNCATE, REFERENCES, TRIGGER ON public\.%I FROM authenticated/)
  })
})

describe('hardening migration', () => {
  // The migration is written defensively (every step checks its table/function exists,
  // because live databases were upgraded by hand and some lack objects such as
  // inventory_units). Policies are therefore created through EXECUTE, partly from a
  // VALUES list, so these checks look at that form.
  it('is idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS', () => {
    const literalCreates = [...migration.matchAll(/CREATE POLICY\s+("[^"]+"|\w+)/gi)].map(m => m[1])
    for (const name of literalCreates) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(migration, name).toMatch(new RegExp(`DROP POLICY IF EXISTS\\s+${esc}`, 'i'))
    }
    // The table-driven UPDATE policies drop before they create, on the same row.
    expect(migration).toMatch(/format\('DROP POLICY IF EXISTS %I ON public\.%I', r\.pol, r\.tbl\);\s*EXECUTE format\('CREATE POLICY %I ON public\.%I FOR UPDATE USING \(%s\) WITH CHECK \(%s\)'/)
    for (const t of ['inventory_units', 'members', 'memberships', 'attendance', 'inventory', 'support_tickets']) {
      expect(migration, t).toMatch(new RegExp(`\\('${t}',`))
    }
  })

  it('skips missing objects instead of failing (e.g. no inventory_units table)', () => {
    expect(migration).toMatch(/IF to_regclass\('public\.' \|\| r\.tbl\) IS NULL THEN/)
    expect(migration).toMatch(/IF to_regprocedure\(f\) IS NOT NULL THEN/)
    // No bare statement may target a table outside a guarded block.
    expect(migration).not.toMatch(/^\s*(DROP|CREATE) POLICY .* ON inventory_units/im)
  })

  it('pins pg_temp on the definer functions that were missing it', () => {
    expect(migration).toMatch(/ALTER FUNCTION %s SET search_path = public, pg_temp/)
    for (const sig of ['public.sell_inventory_item(uuid, integer, numeric, text)', 'public.increment_inventory_stock(uuid, integer)']) {
      expect(migration, sig).toContain(`'${sig}'`)
    }
  })
})
