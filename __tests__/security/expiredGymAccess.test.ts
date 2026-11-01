import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// An expired or deactivated gym must not read OR write tenant data through the API. The UI paywall
// is skipped by a direct call, so withAuth refuses every method; hand-rolled routes call
// assertGymWritable. A static check below makes a new owner route pick one.

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({ gym: null as Record<string, unknown> | null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/supabase/queries', () => ({ getGymForUser: async () => m.gym }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }), ROUTE_LIMITS: { DEFAULT: 60 } }))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: () => {} }))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {} }),
}))

import { withAuth } from '@/lib/api/withAuth'

const req = (method: string) =>
  new NextRequest('http://localhost/api/x', { method, headers: { 'x-requested-with': 'XMLHttpRequest' } })
const ok = async () => NextResponse.json({ success: true })

const PAST = '2020-01-01T00:00:00.000Z'
const FUTURE = '2999-01-01T00:00:00.000Z'
const base = { id: 'g1', name: 'G', plan_type: 'monthly' }
const GYMS = {
  active: { ...base, is_active: true, subscription_status: 'active', subscription_ends_at: FUTURE },
  expired: { ...base, is_active: true, subscription_status: 'expired', subscription_ends_at: PAST },
  inactive: { ...base, is_active: false, subscription_status: 'active', subscription_ends_at: FUTURE },
}

beforeEach(() => { m.gym = null })

describe('withAuth locks out expired and deactivated gyms for every method', () => {
  for (const method of ['GET', 'POST']) {
    it(`${method}: active gym is served`, async () => {
      m.gym = GYMS.active
      expect((await withAuth('T', ok)(req(method))).status).toBe(200)
    })

    for (const state of ['expired', 'inactive'] as const) {
      it(`${method}: ${state} gym gets 403 SUBSCRIPTION_REQUIRED`, async () => {
        m.gym = GYMS[state]
        const res = await withAuth('T', ok)(req(method))
        expect(res.status).toBe(403)
        expect((await res.json()).error.code).toBe('SUBSCRIPTION_REQUIRED')
      })
    }
  }

  it('allowWhenExpired lets an expired gym read and write (renewal, support, account deletion)', async () => {
    m.gym = GYMS.expired
    expect((await withAuth('T', ok, { allowWhenExpired: true })(req('GET'))).status).toBe(200)
    expect((await withAuth('T', ok, { allowWhenExpired: true })(req('POST'))).status).toBe(200)
  })

  it('allowWhenExpired does NOT let a deactivated gym through; only allowWhenBanned does', async () => {
    m.gym = GYMS.inactive
    expect((await withAuth('T', ok, { allowWhenExpired: true })(req('GET'))).status).toBe(403)
    expect((await withAuth('T', ok, { allowWhenExpired: true, allowWhenBanned: true })(req('GET'))).status).toBe(200)
  })
})

// ── Static guard: every owner route must pick a side ─────────────────────────
// A route under app/api is fine when it uses withAuth or calls assertGymWritable. Anything else
// must be listed here on purpose (public, webhook, cron, member-facing, or deliberately open for
// the renewal and support flow). A new unlisted route fails until its author decides.
const API_DIR = join(process.cwd(), 'app', 'api')
const EXEMPT_PREFIXES = [
  'activate/', 'auth/', 'cron/', 'health/', 'member/', 'graph/', 'sentry/', 'webhook/', 'whatsapp/webhook/',
  'whatsapp/queue/', // QStash / Meta / Vercel cron callers authenticate by secret or signature
  'push/send/', // QStash-signed job
  'gamification/leaderboard/', 'gamification/member-events/', // shared with members; the owner branch checks inside
  'import/route.ts', // 501 stub
  // Deliberately open to a lapsed gym: renewal request, subscription state, support, activity beacon.
  'subscription/status/', 'subscription/request/', 'support/clear/', 'support/message/', 'support/ticket/', 'owner/activity/',
]

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? routeFiles(full) : name === 'route.ts' ? [full] : []
  })
}

describe('app/api owner routes', () => {
  it('each uses withAuth, calls assertGymWritable, or is explicitly exempt', () => {
    const offenders = routeFiles(API_DIR)
      .map(f => ({ f, rel: relative(API_DIR, f).split(sep).join('/') }))
      .filter(({ rel }) => !EXEMPT_PREFIXES.some(p => (rel + '/').startsWith(p) || rel.startsWith(p)))
      .filter(({ f }) => !/withAuth\(|assertGymWritable/.test(readFileSync(f, 'utf8')))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })
})
