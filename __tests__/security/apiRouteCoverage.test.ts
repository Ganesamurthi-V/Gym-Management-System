import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Every API route that touches tenant tables must either enforce the owner access gate itself
// (withAuth / assertGymWritable / requireOwnerAccess / getAuthUser) or be a deliberately public or
// machine-only route listed below. A new route that forgets the gate fails this test.
const API_DIR = join(process.cwd(), 'app', 'api')

// Each exception is a deliberate decision, with the reason it is safe without GATE.
const EXCEPTIONS: Record<string, string> = {
  // Public, token-gated, cron-secret, signature or health routes: no signed-in owner acts here.
  'activate/callback/route.ts': 'public activation token flow',
  'activate/complete/route.ts': 'public activation token flow',
  'activate/finalize/route.ts': 'public activation token flow',
  'activate/redeem/route.ts': 'public activation token flow',
  'activate/resend/route.ts': 'public activation token flow',
  'activate/verify/route.ts': 'public activation token flow',
  'auth/finalize-registration/route.ts': 'pre-gym registration step',
  'auth/google/callback/route.ts': 'OAuth callback',
  'auth/login/route.ts': 'login',
  'auth/resend/route.ts': 'pre-login OTP resend',
  'auth/signup/route.ts': 'signup',
  'auth/phone/save/route.ts': 'requirePhoneRouteUser, before the gym exists',
  'cron/subscription/route.ts': 'CRON_SECRET',
  'cron/push-evening/route.ts': 'CRON_SECRET (isAuthorized)',
  'webhook/route.ts': 'provider signature (x-hub-signature-256)',
  'health/route.ts': 'health',
  'health/watchdog/route.ts': 'health',
  // Member PWA routes: member session plus RLS; the member layout is the boundary.
  'member/body-logs/route.ts': 'member session, RLS',
  'member/body-logs/[id]/route.ts': 'member session, RLS',
  'member/body-profile/route.ts': 'member session, RLS',
  'member/push/subscribe/route.ts': 'member session, RLS',
  'member/renewal/route.ts': 'member session, getMemberAccessState',
  'member/workout-sessions/route.ts': 'member session, RLS',
  // Owner routes that must stay reachable for a lapsed or new gym.
  'onboarding/complete/route.ts': 'owner onboarding; gyms writes scoped by owner_id = auth.uid()',
  'owner/activity/route.ts': 'logs only; gym resolved in SQL from auth.uid()',
  'subscription/request/route.ts': 'renewal, must stay open for a lapsed gym',
  'subscription/status/route.ts': 'paywall status read, must stay open',
  'support/clear/route.ts': 'support, open for a lapsed gym by design',
  'support/message/[id]/route.ts': 'support, open for a lapsed gym by design',
  'support/ticket/route.ts': 'support, open for a lapsed gym by design',
}

const GATE = /withAuth\(|assertGymWritable\(|requireOwnerAccess\(|getAuthUser\(/
const DB_TOUCH = /\.from\(|\.rpc\(|createAdminClient\(/

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routes(full)
    return name === 'route.ts' ? [full] : []
  })
}

describe('API routes that touch the database enforce a gate', () => {
  const files = routes(API_DIR).map(f => ({ f, rel: relative(API_DIR, f).split('\\').join('/') }))

  it('finds the API routes', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  for (const { f, rel } of files) {
    if (rel in EXCEPTIONS) continue
    const src = readFileSync(f, 'utf8')
    if (!DB_TOUCH.test(src)) continue
    it(`api/${rel} uses a gate`, () => {
      expect(src).toMatch(GATE)
    })
  }
})
