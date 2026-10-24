import { describe, it, expect, vi, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import {
  runWatchdog, simulateCheck, CHECK_NAMES, type WatchdogDeps,
  FAILED_24H_THRESHOLD, RECIPIENT_WINDOW_WARN, WEBHOOK_UNPROCESSED_THRESHOLD, QSTASH_BUDGET_WARN,
} from '@/lib/monitoring/watchdog'

vi.mock('server-only', () => ({}))

type Ops = Array<[string, unknown[]]>
type Result = { count?: number | null; data?: unknown[] | null; error?: { message: string } | null }
type Handler = (table: string, ops: Ops) => Result | Promise<Result>

/** Chainable fake: every method records itself; awaiting resolves via the handler. */
function fakeSupabase(handler: Handler) {
  const log: string[] = []
  const client = {
    from(table: string) {
      const ops: Ops = []
      log.push(table)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'lt', 'gt', 'gte', 'in', 'or', 'not', 'limit', 'order']) {
        q[m] = (...a: unknown[]) => { ops.push([m, a]); return q }
      }
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        new Promise<Result>((resolve) => resolve(handler(table, ops)))
          .then((r) => ({ count: 0, data: [], error: null, ...r }))
          .then(res, rej)
      return q
    },
  }
  return { client: client as never, log }
}

const NOW = new Date('2026-10-24T12:00:00Z')
const hasOp = (ops: Ops, m: string) => ops.some(([k]) => k === m)
const hasEq = (ops: Ops, col: string, val: unknown) => ops.some(([k, a]) => k === 'eq' && a[0] === col && a[1] === val)

function deps(handler: Handler, over: Partial<WatchdogDeps> = {}) {
  const reportAlert = vi.fn(async (_i?: unknown) => {})
  const { client } = fakeSupabase(handler)
  const d: WatchdogDeps = {
    supabase: client, redis: null, reportAlert, now: () => NOW,
    cronLastOk: async () => new Date(NOW.getTime() - 3600_000), ...over,
  }
  return { d, reportAlert }
}
type Mock = ReturnType<typeof vi.fn>
const alerts = (r: Mock) => r.mock.calls.map((c) => c[0] as { key: string; severity: string; body: string })
const keys = (r: Mock) => alerts(r).map((a) => a.key)
const sev = (r: Mock, key: string) => alerts(r).find((a) => a.key === key)?.severity

describe('healthy', () => {
  it('raises nothing', async () => {
    const { d, reportAlert } = deps(() => ({}), { redis: { ping: async () => 'PONG', get: async () => '5' } })
    const s = await runWatchdog(d)
    expect(s.status).toBe('ok')
    expect(reportAlert).not.toHaveBeenCalled()
    expect(Object.keys(s.checks)).toEqual(CHECK_NAMES)
  })
})

describe('each check alerts with the right key and severity', () => {
  it('queue backlog (warning)', async () => {
    const { d, reportAlert } = deps((t, o) => (t === 'whatsapp_send_queue' && hasEq(o, 'status', 'pending') ? { count: 2 } : {}))
    await runWatchdog(d)
    expect(sev(reportAlert, 'wa:queue_backlog')).toBe('warning')
  })
  it('stuck sending (critical)', async () => {
    const { d, reportAlert } = deps((_t, o) => (hasEq(o, 'status', 'sending') ? { count: 1 } : {}))
    await runWatchdog(d)
    expect(sev(reportAlert, 'wa:queue_stuck_sending')).toBe('critical')
  })
  it('failed high at the boundary: 9 passes, 10 alerts, counts delivery_failed too', async () => {
    const run = async (n: number) => {
      let statuses: unknown
      const { d, reportAlert } = deps((_t, o) => {
        const inOp = o.find(([k]) => k === 'in')
        if (inOp) statuses = inOp[1][1]
        return inOp ? { count: n } : {}
      })
      await runWatchdog(d)
      expect(statuses).toEqual(['failed', 'delivery_failed'])
      return keys(reportAlert)
    }
    expect(await run(FAILED_24H_THRESHOLD - 1)).not.toContain('wa:queue_failed_high')
    expect(await run(FAILED_24H_THRESHOLD)).toContain('wa:queue_failed_high')
  })
  // Fake queue: the error lookup (has order) returns rows; the recovery lookup (status=sent) returns a count.
  const tokenDeps = (lastError: string | null, sentAfter: number) =>
    deps((t, o) => {
      if (t !== 'whatsapp_send_queue') return {}
      if (hasOp(o, 'order')) {
        const f = String(o.find(([k]) => k === 'or')?.[1][0])
        const matches = lastError !== null && f.split(',').some((e) => {
          const needle = e.split('.ilike.%')[1]?.replace(/%$/, '')
          return !!needle && lastError.toLowerCase().includes(needle)
        })
        return { data: matches ? [{ created_at: '2026-10-24T11:30:00Z' }] : [] }
      }
      return hasEq(o, 'status', 'sent') ? { count: sentAfter } : {}
    })
  it('token error: "Meta 190: Invalid OAuth access token" alerts (critical)', async () => {
    const { d, reportAlert } = tokenDeps('Meta 190: Invalid OAuth access token', 0)
    await runWatchdog(d)
    expect(sev(reportAlert, 'wa:token_expired')).toBe('critical')
  })
  it('a phone number containing 401 does not alert', async () => {
    const { d, reportAlert } = tokenDeps('recipient 919940140123 not on WhatsApp', 0)
    await runWatchdog(d)
    expect(keys(reportAlert)).not.toContain('wa:token_expired')
  })
  it('the same error followed by a later sent row does not alert', async () => {
    const { d, reportAlert } = tokenDeps('Meta 190: Invalid OAuth access token', 1)
    await runWatchdog(d)
    expect(keys(reportAlert)).not.toContain('wa:token_expired')
  })
  it('token expired from the live Graph check', async () => {
    const { d, reportAlert } = deps(() => ({}), { metaCheck: async () => ({ ok: false, detail: 'http_401' }) })
    await runWatchdog(d)
    expect(sev(reportAlert, 'wa:token_expired')).toBe('critical')
  })
  it('a Meta 5xx is not a token alert', async () => {
    const { d, reportAlert } = deps(() => ({}), { metaCheck: async () => ({ ok: false, detail: 'http_503' }) })
    await runWatchdog(d)
    expect(keys(reportAlert)).not.toContain('wa:token_expired')
  })
  it('recipient window at the boundary', async () => {
    const run = async (n: number) => {
      const { d, reportAlert } = deps((t) => (t === 'whatsapp_recipient_window' ? { count: n } : {}))
      await runWatchdog(d)
      return keys(reportAlert)
    }
    expect(await run(RECIPIENT_WINDOW_WARN - 1)).not.toContain('wa:recipient_window_high')
    expect(await run(RECIPIENT_WINDOW_WARN)).toContain('wa:recipient_window_high')
  })
  it('cron stale is critical; exactly 26 h and missing are not alerts', async () => {
    const stale = deps(() => ({}), { cronLastOk: async () => new Date(NOW.getTime() - 27 * 3600_000) })
    await runWatchdog(stale.d)
    expect(keys(stale.reportAlert)).toEqual(expect.arrayContaining(['cron:whatsapp:stale', 'cron:subscription:stale']))
    expect(sev(stale.reportAlert, 'cron:whatsapp:stale')).toBe('critical')
    const edge = deps(() => ({}), { cronLastOk: async () => new Date(NOW.getTime() - 26 * 3600_000) })
    await runWatchdog(edge.d)
    expect(edge.reportAlert).not.toHaveBeenCalled()
    const missing = deps(() => ({}), { cronLastOk: async () => null })
    const s = await runWatchdog(missing.d)
    expect(missing.reportAlert).not.toHaveBeenCalled()
    expect(s.checks.cron_whatsapp_stale.detail).toContain('unknown')
  })
  it('subscription cron missed (critical, gym ids in body)', async () => {
    const { d, reportAlert } = deps((t, o) => (t === 'gyms' && hasOp(o, 'or') ? { data: [{ id: 'g1' }, { id: 'g2' }], count: 2 } : {}))
    await runWatchdog(d)
    const a = alerts(reportAlert).find((x) => x.key === 'sub:cron_missed')
    expect(a?.severity).toBe('critical')
    expect(a?.body).toContain('g1, g2')
  })
  it('requests waiting (warning)', async () => {
    const { d, reportAlert } = deps((t) => (t === 'subscription_requests' ? { count: 1 } : {}))
    await runWatchdog(d)
    expect(sev(reportAlert, 'sub:requests_waiting')).toBe('warning')
  })
  it('webhooks unprocessed at the boundary', async () => {
    const run = async (n: number) => {
      const { d, reportAlert } = deps((t) => (t === 'whatsapp_webhook_logs' ? { count: n } : {}))
      await runWatchdog(d)
      return keys(reportAlert)
    }
    expect(await run(WEBHOOK_UNPROCESSED_THRESHOLD - 1)).not.toContain('wa:webhook_unprocessed')
    expect(await run(WEBHOOK_UNPROCESSED_THRESHOLD)).toContain('wa:webhook_unprocessed')
  })
  it('qstash budget reads the UTC-day key at the boundary', async () => {
    const get = vi.fn(async () => String(QSTASH_BUDGET_WARN - 1))
    const ok = deps(() => ({}), { redis: { ping: async () => 1, get } })
    await runWatchdog(ok.d)
    expect(get).toHaveBeenCalledWith('qstash:publishes:20261024')
    expect(keys(ok.reportAlert)).not.toContain('qstash:budget')
    const hi = deps(() => ({}), { redis: { ping: async () => 1, get: async () => String(QSTASH_BUDGET_WARN) } })
    await runWatchdog(hi.d)
    expect(sev(hi.reportAlert, 'qstash:budget')).toBe('warning')
  })
  it('redis down is critical; unconfigured is silent', async () => {
    const down = deps(() => ({}), { redis: { ping: async () => { throw new Error('x') }, get: async () => null } })
    await runWatchdog(down.d)
    expect(sev(down.reportAlert, 'redis:down')).toBe('critical')
    const none = deps(() => ({}))
    await runWatchdog(none.d)
    expect(keys(none.reportAlert)).not.toContain('redis:down')
  })
  it('db slow is a warning', async () => {
    const { d, reportAlert } = deps(() => ({}))
    let n = 0
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => (n++ === 0 ? 1_000 : 4_000))
    await runWatchdog(d)
    spy.mockRestore()
    expect(sev(reportAlert, 'db:slow')).toBe('warning')
  })
})

describe('isolation', () => {
  it('a throwing check does not stop the others', async () => {
    const { d, reportAlert } = deps((t) => {
      if (t === 'subscription_requests') throw new Error('boom')
      if (t === 'whatsapp_webhook_logs') return { count: 99 }
      return {}
    })
    const s = await runWatchdog(d)
    expect(keys(reportAlert)).toEqual(expect.arrayContaining(['watchdog:check_error:sub_requests_waiting', 'wa:webhook_unprocessed']))
    expect(sev(reportAlert, 'watchdog:check_error:sub_requests_waiting')).toBe('warning')
    expect(s.status).toBe('alerting')
    expect(JSON.stringify(s)).not.toContain('boom')
  })
  it('a query error becomes a check_error warning', async () => {
    const { d, reportAlert } = deps((t) => (t === 'whatsapp_recipient_window' ? { error: { message: 'bad' } } : {}))
    await runWatchdog(d)
    expect(keys(reportAlert)).toContain('watchdog:check_error:recipient_window_high')
  })
  it('a hung check times out', async () => {
    const { d, reportAlert } = deps((t) => (t === 'subscription_requests' ? new Promise<Result>(() => {}) : {}), { timeoutMs: 30 })
    await runWatchdog(d)
    expect(keys(reportAlert)).toContain('watchdog:check_error:sub_requests_waiting')
  })
})

describe('simulate', () => {
  it('only raises the alert and reads nothing', async () => {
    const reportAlert = vi.fn(async (_i?: unknown) => {})
    expect(await simulateCheck('redis_down', { reportAlert })).toBe(true)
    expect(reportAlert).toHaveBeenCalledTimes(1)
    expect(reportAlert.mock.calls[0][0]).toMatchObject({ key: 'drill:redis_down', severity: 'critical' })
  })
  it('unknown name returns false', async () => {
    expect(await simulateCheck('nope', { reportAlert: vi.fn() })).toBe(false)
  })
})

describe('route', () => {
  const reportAlert = vi.fn(async (_i?: unknown) => {})
  afterEach(() => { vi.unstubAllEnvs(); reportAlert.mockClear() })

  async function call(url: string, secret?: string) {
    vi.resetModules()
    vi.doMock('@/lib/monitoring/alert', () => ({ reportAlert }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeSupabase(() => ({})).client }))
    vi.doMock('@/lib/monitoring/checks', () => ({ checkWhatsAppMeta: async () => ({ ok: true }) }))
    vi.doMock('@/lib/redis', () => ({ redis: null }))
    vi.doMock('@/lib/monitoring/cronStatus', () => ({ getCronLastOk: async () => null }))
    const { GET } = await import('@/app/api/health/watchdog/route')
    const headers = new Headers(secret ? { 'x-health-secret': secret } : {})
    return GET({ headers, nextUrl: new URL(url) } as unknown as NextRequest)
  }

  it('503 when the secret is unset', async () => {
    vi.stubEnv('HEALTH_CHECK_SECRET', '')
    const r = await call('http://x/api/health/watchdog', 'a')
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ status: 'unconfigured' })
  })
  it('401 without or with a wrong secret', async () => {
    vi.stubEnv('HEALTH_CHECK_SECRET', 'good')
    expect((await call('http://x/api/health/watchdog')).status).toBe(401)
    expect((await call('http://x/api/health/watchdog', 'bad')).status).toBe(401)
  })
  it('200 with a good secret, no-store', async () => {
    vi.stubEnv('HEALTH_CHECK_SECRET', 'good')
    const r = await call('http://x/api/health/watchdog', 'good')
    expect(r.status).toBe(200)
    expect(r.headers.get('Cache-Control')).toBe('no-store')
    const j = await r.json()
    expect(['ok', 'alerting']).toContain(j.status)
    expect(j.timestamp).toBeTruthy()
  })
  it('simulate raises one alert; unknown name is 400', async () => {
    vi.stubEnv('HEALTH_CHECK_SECRET', 'good')
    const r = await call('http://x/api/health/watchdog?simulate=redis_down', 'good')
    expect(r.status).toBe(200)
    expect(reportAlert).toHaveBeenCalledTimes(1)
    const bad = await call('http://x/api/health/watchdog?simulate=nope', 'good')
    expect(bad.status).toBe(400)
  })
})
