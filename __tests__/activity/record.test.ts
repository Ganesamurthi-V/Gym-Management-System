import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({ after: vi.fn(), error: vi.fn(), afterThrows: false }))

vi.mock('next/server', () => ({
  after: (fn: () => Promise<void>) => {
    if (m.afterThrows) throw new Error('outside request scope')
    m.after(fn)
    return fn()
  },
}))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ error: m.error, warn() {}, info() {} }),
}))

import { recordOwnerAction } from '@/lib/activity/record'

const req = (pathname: string) => ({ nextUrl: { pathname } })

beforeEach(() => {
  vi.clearAllMocks()
  m.afterThrows = false
})

describe('recordOwnerAction', () => {
  it('schedules the RPC with the label and normalised path', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    recordOwnerAction({ rpc } as never, req('/api/members/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab'), 'MEMBERS_UPDATE')
    await Promise.resolve()
    expect(m.after).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('record_owner_activity', {
      p_kind: 'action', p_path: '/api/members/:id', p_label: 'MEMBERS_UPDATE', p_platform: null,
    })
  })

  it('does not throw when the RPC errors or rejects', async () => {
    const rpcErr = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    expect(() => recordOwnerAction({ rpc: rpcErr } as never, req('/api/payments'), 'PAYMENTS_COLLECT')).not.toThrow()
    const rpcThrow = vi.fn().mockRejectedValue(new Error('net'))
    expect(() => recordOwnerAction({ rpc: rpcThrow } as never, req('/api/payments'), 'PAYMENTS_COLLECT')).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(m.error).toHaveBeenCalledTimes(2)
  })

  it('does not throw when after() is unavailable', () => {
    m.afterThrows = true
    const rpc = vi.fn()
    expect(() => recordOwnerAction({ rpc } as never, req('/api/payments'), 'PAYMENTS_COLLECT')).not.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('skips the activity route', () => {
    const rpc = vi.fn()
    recordOwnerAction({ rpc } as never, req('/api/owner/activity'), 'X')
    expect(m.after).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})

// Every mutating route handler that does not use withAuth must either record owner activity or be
// listed here with the reason it is not an owner action, so a new route cannot silently drop out.
const EXCLUDED: Record<string, string> = {
  'activate/': 'public member activation flow',
  'auth/': 'public / pre-login auth flow',
  'cron/': 'cron worker, CRON_SECRET',
  'graph/': 'Graph API reverse proxy',
  'sentry/webhook/': 'Sentry webhook',
  'webhook/': 'payment provider webhook',
  'whatsapp/webhook/': 'Meta webhook',
  'whatsapp/queue/drain/': 'QStash worker',
  'push/send/': 'QStash push worker',
  'member/': 'member-facing routes',
  'owner/activity/': 'the activity log itself',
  'import/route.ts': 'stub that always returns 501',
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : n === 'route.ts' ? [p] : []
  })
}

describe('owner mutating routes record activity', () => {
  const root = join(process.cwd(), 'app', 'api')
  const mutating = /export\s+(async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/
  const files = walk(root).map((p) => ({ rel: relative(root, p).split(sep).join('/'), src: readFileSync(p, 'utf8') }))
  const excluded = (rel: string) => Object.keys(EXCLUDED).some((k) => rel.startsWith(k) || rel === k)

  const candidates = files.filter((f) => mutating.test(f.src) && !f.src.includes('withAuth(') && !excluded(f.rel))

  it('finds the instrumented routes', () => {
    expect(candidates.length).toBeGreaterThanOrEqual(15)
  })

  for (const f of candidates) {
    it(`${f.rel} imports and calls recordOwnerAction`, () => {
      expect(f.src).toContain("from '@/lib/activity/record'")
      expect(f.src).toMatch(/recordOwnerAction\(\s*supabase,\s*req,\s*'[A-Z][A-Z0-9_]+'\s*\)/)
    })
  }
})
