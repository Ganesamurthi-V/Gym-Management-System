import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression: the activation routes only gated redeem and finalize, so a Free-plan (or lapsed, or
// beyond-50-trial) member holding an old link could still set a password (complete), have portal
// flags written (callback) or be sent verification emails (resend).

const h = vi.hoisted(() => ({
  access: false,
  writes: [] as string[],
  sendEmail: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: vi.fn() }))
vi.mock('@/lib/member/member-data', () => ({ getMemberAppAccess: async () => h.access }))
vi.mock('@/lib/member/activation-email', () => ({ sendVerificationEmail: (...a: unknown[]) => h.sendEmail(...a) }))

const memberRow = { id: 'm1', gym_id: 'g1', created_at: '2026-01-01', email: 'a@b.co', invitation_status: 'invited', portal_enabled: true, portal_suspended: false }

function service() {
  return {
    auth: { admin: { updateUserById: async () => { h.writes.push('auth.updateUserById'); return { error: null } } } },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: memberRow, error: null }) }),
          maybeSingle: async () => ({ data: { id: 'm1', gym_id: 'g1', created_at: '2026-01-01' }, error: null }),
        }),
      }),
      update: () => { h.writes.push('members.update'); return { eq: () => ({ eq: async () => ({ error: null }) }) } },
      insert: async () => { h.writes.push('members.insert'); return { error: null } },
    }),
  }
}

vi.mock('@/lib/member/activation-token', () => ({
  activateRateLimitOk: async () => true,
  getServiceSupabase: () => service(),
  resolveInvitationToken: async () => ({ ok: true, authUser: { id: 'u1', user_metadata: {}, email: 'a@b.co' }, memberId: 'm1', gymId: 'g1' }),
  isPlaceholderEmail: () => false,
}))

const post = (body: unknown) => ({ json: async () => body, headers: new Headers() }) as never

describe('activation plan gate', () => {
  beforeEach(() => { h.access = false; h.writes.length = 0; h.sendEmail.mockReset() })

  const token = 'x'.repeat(30)

  it('complete: refuses a member without member-app access before any write', async () => {
    const { POST } = await import('@/app/api/activate/complete/route')
    const res = await POST(post({ token, email: 'a@b.co', password: 'password1' }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('PLAN_NOT_ALLOWED')
    expect(h.writes).toEqual([])
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('complete: proceeds to the writes when the plan allows the member app', async () => {
    h.access = true
    h.sendEmail.mockResolvedValue({ ok: true })
    const { POST } = await import('@/app/api/activate/complete/route')
    const res = await POST(post({ token, email: 'a@b.co', password: 'password1' }))
    expect(res.status).toBe(200)
    expect(h.writes).toContain('auth.updateUserById')
  })

  it('resend: refuses before sending any email', async () => {
    const { POST } = await import('@/app/api/activate/resend/route')
    const res = await POST(post({ token }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('PLAN_NOT_ALLOWED')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('verify: refuses with PLAN_NOT_ALLOWED', async () => {
    const { POST } = await import('@/app/api/activate/verify/route')
    const res = await POST(post({ token }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('PLAN_NOT_ALLOWED')
  })
})

describe('activate/callback plan gate', () => {
  beforeEach(() => { h.access = false; h.writes.length = 0; vi.resetModules() })

  it('signs the new session out and writes nothing for a member without member-app access', async () => {
    const signOut = vi.fn(async () => ({}))
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({
        auth: { exchangeCodeForSession: async () => ({ data: { user: { id: 'u1', user_metadata: {} } }, error: null }), signOut },
      }),
    }))
    process.env.SUPABASE_URL = 'http://x'
    process.env.SUPABASE_ANON_KEY = 'k'
    const { GET } = await import('@/app/api/activate/callback/route')
    const res = await GET({ nextUrl: new URL('http://app.test/api/activate/callback?code=abc') } as never)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('failed=plan_not_allowed')
    expect(signOut).toHaveBeenCalled()
    expect(h.writes).toEqual([])
  })
})
