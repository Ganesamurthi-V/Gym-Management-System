import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const files = {
  schema: readFileSync(join(root, 'supabase-schema.sql'), 'utf8'),
  migration: readFileSync(join(root, 'supabase/migrations/20261031100000_owner_activity.sql'), 'utf8'),
}

describe.each(Object.entries(files))('owner activity security (%s)', (_name, sql) => {
  it('enables RLS and defines no policy on the table', () => {
    expect(sql).toMatch(/ALTER TABLE (public\.)?owner_activity_events\s+ENABLE ROW LEVEL SECURITY/)
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON (public\.)?owner_activity_events/i)
  })
  it('grants the table to no API role', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.owner_activity_events FROM PUBLIC, anon, authenticated;/)
    expect(sql).not.toMatch(/GRANT [^;]* ON (public\.)?owner_activity_events/i)
  })
  it('record_owner_activity is a definer function bound to auth.uid() with an empty search_path', () => {
    const fn = sql.slice(
      sql.indexOf('CREATE FUNCTION public.record_owner_activity'),
      sql.indexOf('CREATE FUNCTION public.delete_old_owner_activity'),
    )
    expect(fn).toContain('SECURITY DEFINER')
    expect(fn).toContain("SET search_path = ''")
    expect(fn).toContain('auth.uid()')
    expect(fn).not.toMatch(/p_gym|p_owner/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_owner_activity\(TEXT, TEXT, TEXT, TEXT\) TO authenticated;/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_owner_activity\(TEXT, TEXT, TEXT, TEXT\) FROM PUBLIC, anon;/)
  })
  it('retention function is service_role only and defaults to 15 days', () => {
    expect(sql).toContain('delete_old_owner_activity(p_days INT DEFAULT 15)')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.delete_old_owner_activity\(INT\) FROM PUBLIC, anon, authenticated;/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_old_owner_activity\(INT\) TO service_role;/)
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_old_owner_activity\(INT\) TO authenticated/)
  })
})
