import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const strip = (sql: string) => sql.replace(/--[^\n]*/g, '')
const schema = strip(readFileSync(join(process.cwd(), 'supabase-schema.sql'), 'utf8'))

describe('admin notes live outside the gyms row', () => {
  it('gyms has no admin_notes column and nothing else in the schema references it', () => {
    const gyms = schema.match(/CREATE TABLE IF NOT EXISTS gyms \(([\s\S]*?)\n\);/)
    expect(gyms).not.toBeNull()
    expect(gyms![1]).not.toMatch(/(?<![a-z_])admin_notes/)
    expect(schema).not.toMatch(/(?<![a-z_])admin_notes/)
  })

  it('gym_admin_notes has RLS, no policies, revoked client roles and a service_role grant', () => {
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS gym_admin_notes/)
    expect(schema).toMatch(/ALTER TABLE gym_admin_notes\s+ENABLE ROW LEVEL SECURITY/)
    expect(schema).toMatch(/REVOKE ALL ON public\.gym_admin_notes FROM PUBLIC, anon, authenticated/)
    expect(schema).toMatch(/GRANT ALL ON public\.gym_admin_notes TO service_role/)
    expect(schema).not.toMatch(/POLICY[^;]*ON\s+(public\.)?gym_admin_notes/i)
    expect(schema).not.toMatch(/PUBLICATION[^;]*gym_admin_notes/i)
  })
})
