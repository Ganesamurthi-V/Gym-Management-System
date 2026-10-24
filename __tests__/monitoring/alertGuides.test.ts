import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { getAlertGuide, GENERIC_GUIDE } from '@/lib/monitoring/alertGuides'

const ROOT = join(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

/** Collect alert key literals passed to reportAlert / reportAlertInBackground, plus watchdog check keys. */
function collectKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  const add = (k: string, file: string) => {
    // Template keys: replace ${...} with a sample so prefix patterns are exercised.
    const sample = k.replace(/\$\{[^}]*\}/g, 'sample')
    if (!keys.has(sample)) keys.set(sample, file)
  }
  for (const dir of ['lib', 'app', 'services']) {
    for (const file of walk(join(ROOT, dir))) {
      if (file.endsWith('alertGuides.ts') || file.endsWith(join('monitoring', 'alert.ts'))) continue
      const src = readFileSync(file, 'utf8')
      const rel = file.slice(ROOT.length + 1)
      const callRe = /(?:reportAlert|reportAlertInBackground)\(\s*\{[\s\S]{0,400}?key:\s*(['`])([^'`]+)\1/g
      for (const m of src.matchAll(callRe)) add(m[2], rel)
      if (file.endsWith('watchdog.ts')) {
        for (const m of src.matchAll(/fail\([^,]+,\s*'[a-z]+',\s*(['`])([^'`]+)\1/g)) add(m[2], rel)
        for (const m of src.matchAll(/key:\s*`((?:drill|watchdog:check_error):[^`]+)`/g)) add(m[1], rel)
      }
    }
  }
  return keys
}

describe('alert guides', () => {
  const keys = collectKeys()

  it('finds the alert keys in the source (scanner sanity)', () => {
    expect(keys.size).toBeGreaterThan(30)
    expect(keys.has('wa:token_invalid')).toBe(true)
    expect(keys.has('wa:queue_backlog')).toBe(true)
  })

  it('every alert key has a specific (non-generic) guide', () => {
    const missing = [...keys].filter(([k]) => getAlertGuide(k) === GENERIC_GUIDE).map(([k, f]) => `${k} (${f})`)
    expect(missing, `Add a guide in lib/monitoring/alertGuides.ts for: ${missing.join(', ')}`).toEqual([])
  })

  it('every guide has content in each field', () => {
    for (const [k] of keys) {
      const g = getAlertGuide(k)
      expect(g.happening.length, k).toBeGreaterThan(10)
      expect(g.failing.length, k).toBeGreaterThan(10)
      expect(g.check.length, k).toBeGreaterThan(0)
      expect(g.fix.length, k).toBeGreaterThan(0)
    }
  })
})
