import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// The member limit has one source (PLAN_MEMBER_LIMIT) and prices come from platform_settings
// (lib/platformPrices.ts). The old per-feature aliases and hard-coded prices must not come back.

const ROOT = join(__dirname, '..', '..')
const DIRS = ['app', 'lib', 'components', 'features']
const REMOVED = ['FREE_PLAN_MEMBER_LIMIT', 'TRIAL_APP_MEMBER_LIMIT', 'TRIAL_IMPORT_ROW_LIMIT', 'WHATSAPP_ADDON_PRICE_INR']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (name === 'node_modules' || name === '.next') return []
    if (statSync(p).isDirectory()) return files(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

/** Comments may mention a number to explain a decision; only code is checked for prices. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const all = DIRS.flatMap(d => files(join(ROOT, d)))

describe('single sources for plan limit and prices', () => {
  it('scans a non-trivial number of files', () => {
    expect(all.length).toBeGreaterThan(100)
  })

  it('no root source file references a removed constant', () => {
    const hits = all.filter(f => REMOVED.some(name => readFileSync(f, 'utf8').includes(name)))
    expect(hits.map(f => f.replace(ROOT, ''))).toEqual([])
  })

  it('no root source file hard-codes the add-on or plan price', () => {
    const hits = all.filter(f => /(?<![\d._])(299|999|9999)(?![\d_])/.test(
      stripComments(readFileSync(f, 'utf8')).replace(/z-\[9999\]|23, ?59, ?59, ?999|-999\b|\.999\b|xp: ?\d+|\(299\)|9999\)|\b299\)/g, ''),
    ))
    expect(hits.map(f => f.replace(ROOT, ''))).toEqual([])
  })
})
