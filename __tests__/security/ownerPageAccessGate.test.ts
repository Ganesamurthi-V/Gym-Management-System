import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// A layout is not re-rendered on soft client navigations, so AppShell's AccessGate alone cannot stop an
// expired or banned owner from soft-navigating. Each owner page must enforce the gate in its own render.
const OWNER_DIR = join(process.cwd(), 'app', 'owner')
const EXEMPT = new Set(['page.tsx', 'subscription/page.tsx', 'onboarding/page.tsx'])

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return pages(full)
    return name === 'page.tsx' ? [full] : []
  })
}

describe('owner pages enforce the access gate', () => {
  const targets = pages(OWNER_DIR)
    .map(f => ({ f, rel: relative(OWNER_DIR, f).split('\\').join('/') }))
    .filter(({ rel }) => !EXEMPT.has(rel))

  it('finds the owner pages', () => {
    expect(targets.length).toBeGreaterThan(10)
  })

  for (const { f, rel } of targets) {
    const src = readFileSync(f, 'utf8')
    // Client pages have no server render; their API routes enforce access instead.
    if (/^\s*['"]use client['"]/.test(src)) continue
    it(`${rel} calls requireOwnerAccess()`, () => {
      expect(src).toMatch(/requireOwnerAccess\)?\(\)/)
    })
  }
})
