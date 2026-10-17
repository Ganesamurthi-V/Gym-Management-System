import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Regression: activation routes trusted user-editable user_metadata for service-role
// writes, and token-checking endpoints had no request rate limit.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const lib = read('lib/member/activation-token.ts')

describe('activate routes identity', () => {
  it('callback resolves the member via auth_user_id, not user_metadata', () => {
    const s = read('app/api/activate/callback/route.ts')
    expect(s).toMatch(/\.eq\('auth_user_id', user\.id\)/)
    expect(s).not.toMatch(/user_metadata\?\.(member_id|gym_id)/)
  })
  it('token resolution links the member via auth_user_id, not user_metadata', () => {
    expect(lib).toMatch(/\.eq\('auth_user_id', authUser\.id\)/)
    expect(lib).not.toMatch(/user_metadata\?\.(member_id|gym_id)/)
  })
  it('status only checks a body memberId that the token embeds', () => {
    expect(read('app/api/activate/status/route.ts')).toMatch(/body\.memberId === tokenMemberId\(token\)/)
  })
})

describe('activate routes rate limiting', () => {
  for (const name of ['complete', 'verify', 'status', 'resend']) {
    it(`${name} is rate limited before touching the token`, () => {
      const s = read(`app/api/activate/${name}/route.ts`)
      const i = s.indexOf(`activateRateLimitOk(req, '${name}'`)
      expect(i).toBeGreaterThan(-1)
      expect(i).toBeLessThan(s.indexOf('resolveInvitationToken(supabase'))
    })
  }
})
