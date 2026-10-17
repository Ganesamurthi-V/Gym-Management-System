import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Regression: /api/activate/finalize once took `userId` from the request body and
// activated that account with the service role, with no session at all.
const route = readFileSync(join(process.cwd(), 'app/api/activate/finalize/route.ts'), 'utf8')
const page = readFileSync(join(process.cwd(), 'app/activate/verifying/page.tsx'), 'utf8')

describe('activate/finalize identity', () => {
  it('takes the user from the session, not the request body', () => {
    expect(route).toMatch(/auth\.getUser\(\)/)
    expect(route).not.toMatch(/req\.json\(\)/)
    expect(route).not.toMatch(/getUserById\(\s*userId/)
  })
  it('finds the member through the server-owned auth_user_id link, not user_metadata', () => {
    expect(route).toMatch(/\.eq\('auth_user_id', user\.id\)/)
    expect(route).not.toMatch(/user_metadata\?\.member_id/)
  })
  it('callers no longer send a userId', () => {
    const calls = page.split("fetch('/api/activate/finalize'").slice(1).map(c => c.slice(0, 300))
    expect(calls.length).toBe(2)
    for (const c of calls) expect(c).not.toMatch(/userId/)
  })
})
