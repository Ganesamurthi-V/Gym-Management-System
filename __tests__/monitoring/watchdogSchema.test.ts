import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { WATCHDOG_QUERY_TARGETS, TOKEN_ERROR_FILTER, subCronOrFilter } from '@/lib/monitoring/watchdog'

vi.mock('server-only', () => ({}))

const sql = readFileSync(join(process.cwd(), 'supabase-schema.sql'), 'utf8')

/** table name -> set of column names, from the CREATE TABLE blocks (column = first token of a line). */
function parseTables(src: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>()
  const re = /CREATE TABLE IF NOT EXISTS\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi
  for (const m of src.matchAll(re)) {
    const cols = new Set<string>()
    for (const line of m[2].split('\n')) {
      const c = /^\s{1,4}"?([a-z_][a-z0-9_]*)"?\s+[A-Za-z]/.exec(line)
      if (c && !/^(primary|unique|foreign|constraint|check)$/i.test(c[1])) cols.add(c[1].toLowerCase())
    }
    tables.set(m[1].toLowerCase(), cols)
  }
  // Columns added later with ALTER TABLE ... ADD COLUMN IF NOT EXISTS
  for (const m of src.matchAll(/ALTER TABLE\s+(?:public\.)?(\w+)\s+ADD COLUMN IF NOT EXISTS\s+"?(\w+)"?/gi)) {
    tables.get(m[1].toLowerCase())?.add(m[2].toLowerCase())
  }
  return tables
}

describe('watchdog queries match supabase-schema.sql', () => {
  const tables = parseTables(sql)
  for (const { table, columns } of WATCHDOG_QUERY_TARGETS) {
    it(`${table}`, () => {
      const cols = tables.get(table)
      expect(cols, `table "${table}" is missing from supabase-schema.sql`).toBeDefined()
      for (const c of columns) {
        expect(cols!.has(c), `column "${table}.${c}" is missing from supabase-schema.sql`).toBe(true)
      }
    })
  }
})

/** PostgREST logic-tree: comma-separated `column.operator.value` or `and(...)`/`or(...)` groups. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out
}
const OPS = /^(eq|neq|gt|gte|lt|lte|like|ilike|is|in)$/
function validFilter(s: string): boolean {
  if (depthBad(s)) return false
  return splitTop(s).every((e) => {
    const g = /^(and|or)\((.*)\)$/.exec(e)
    if (g) return validFilter(g[2])
    const m = /^([a-z_][a-z0-9_]*)\.([a-z]+)\.(.+)$/.exec(e)
    return !!m && OPS.test(m[2])
  })
}
function depthBad(s: string) {
  let d = 0
  for (const ch of s) { d += ch === '(' ? 1 : ch === ')' ? -1 : 0; if (d < 0) return true }
  return d !== 0
}

describe('PostgREST or() filters', () => {
  it('token filter is valid', () => expect(validFilter(TOKEN_ERROR_FILTER)).toBe(true))
  it('subscription filter is valid', () => expect(validFilter(subCronOrFilter('2026-10-23T00:00:00.000Z'))).toBe(true))
  it('the validator rejects malformed filters', () => {
    expect(validFilter('last_error.contains.x')).toBe(false)
    expect(validFilter('and(a.eq.1,b.lt.2')).toBe(false)
    expect(validFilter('justtext')).toBe(false)
  })
})
