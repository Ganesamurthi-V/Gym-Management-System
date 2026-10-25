/**
 * Source-level regression tests for the owner-actions / cron / upload hardening.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const read = (p: string) => fs.readFileSync(p, 'utf8')

describe('cache invalidation actions verify gym ownership', () => {
  it('inventory actions check gyms.owner_id', () => {
    const s = read('app/owner/inventory/actions.ts')
    expect(s).toContain(".eq('owner_id'")
    expect(s).not.toContain('requireAuth()')
  })
  it('members actions bound pagination and check ownership', () => {
    const s = read('app/owner/members/actions.ts')
    expect(s).toContain('limit > 200')
    expect(s.match(/\.eq\('owner_id'/g)!.length).toBeGreaterThanOrEqual(3)
  })
})

describe('payment-proof upload', () => {
  const s = read('app/api/subscription/request/route.ts')
  it('sniffs magic bytes, rate limits, caps lengths, hides storage errors', () => {
    expect(s).toContain('0x89, 0x50, 0x4e, 0x47')
    expect(s).toContain('checkRateLimit')
    expect(s).toContain('notes?.length')
    expect(s).not.toContain('uploadError?.message ??')
    expect(s).not.toContain('{ error: insertError.message }, { status')
  })
})

describe('secret comparisons are constant-time and errors are generic', () => {
  const files = [
    'app/api/cron/whatsapp/route.ts',
    'app/api/cron/subscription/route.ts',
    'app/api/whatsapp/queue/drain/route.ts',
  ]
  for (const f of files) {
    it(f, () => {
      const s = read(f)
      expect(s).toContain('timingSafeSecretEqual')
      expect(s).not.toMatch(/===\s*cronSecret|!==\s*cronSecret/)
      expect(s).not.toMatch(/error:\s*message\b/)
    })
  }
})
