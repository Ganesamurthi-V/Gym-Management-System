import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createAlerter,
  reportAlert,
  reportAlertInBackground,
  buildTelegramText,
  scrubPii,
  type AlertDeps,
  type AlertInput,
} from '@/lib/monitoring/alert'

const TOKEN = 'SECRET-BOT-TOKEN-123'

function fakeRedis(clock: () => number = () => 0) {
  const store = new Map<string, number>()
  const exp = new Map<string, number>()
  const live = (k: string) => {
    const e = exp.get(k)
    if (e !== undefined && e <= clock()) { store.delete(k); exp.delete(k) }
    return store.has(k)
  }
  return {
    set: vi.fn(async (k: string, v: string, o: { nx?: true; ex: number }) => {
      if (o.nx && live(k)) return null
      store.set(k, Number(v) || 1)
      exp.set(k, clock() + o.ex * 1000)
      return 'OK'
    }),
    get: vi.fn(async (k: string) => (live(k) ? store.get(k)! : null)),
    incr: vi.fn(async (k: string) => {
      const n = (live(k) ? store.get(k)! : 0) + 1
      store.set(k, n)
      return n
    }),
    decr: vi.fn(async (k: string) => {
      const n = (store.get(k) ?? 0) - 1
      store.set(k, n)
      return n
    }),
    expire: vi.fn(async (k: string, sec: number) => { exp.set(k, clock() + sec * 1000); return 1 }),
    del: vi.fn(async (k: string) => { store.delete(k); exp.delete(k); return 1 }),
    store,
  }
}

function make(over: Partial<AlertDeps> = {}, env: Record<string, string> = {}) {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response)
  const insert = vi.fn(async () => ({ error: null }))
  const deps: AlertDeps = {
    redis: fakeRedis(),
    fetch: fetchMock as unknown as typeof fetch,
    supabase: () => ({ from: () => ({ insert }) }),
    now: () => Date.UTC(2026, 9, 24, 10, 0, 0),
    env: { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '42', NODE_ENV: 'production', ...env },
    ...over,
  }
  return { alerter: createAlerter(deps), fetchMock, insert, deps }
}

const alert = (key = 'k1', over: Partial<AlertInput> = {}): AlertInput => ({
  key, severity: 'critical', title: 'Boom', body: 'details', ...over,
})

afterEach(() => vi.restoreAllMocks())

describe('dedupe', () => {
  it('first call sends to both sinks, second inside cooldown is suppressed', async () => {
    const { alerter, fetchMock, insert } = make()
    await alerter.report(alert())
    await alerter.report(alert())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ type: 'alert', entity_id: 'k1', gym_id: null }))
  })

  it('different keys both send', async () => {
    const { alerter, fetchMock } = make()
    await alerter.report(alert('a'))
    await alerter.report(alert('b'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses 1800s for critical and 21600s for warning', async () => {
    const redis = fakeRedis()
    const { alerter } = make({ redis })
    await alerter.report(alert('c1'))
    await alerter.report(alert('w1', { severity: 'warning' }))
    expect(redis.set).toHaveBeenCalledWith('alert:c1', expect.any(String), { nx: true, ex: 1800 })
    expect(redis.set).toHaveBeenCalledWith('alert:w1', expect.any(String), { nx: true, ex: 21600 })
  })
})

describe('hourly cap', () => {
  it('suppresses over the cap and sends exactly one cap notice', async () => {
    const { alerter, fetchMock } = make({}, { ALERT_MAX_PER_HOUR: '2' })
    for (const k of ['a', 'b', 'c', 'd', 'e']) await alerter.report(alert(k))
    // 2 real alerts + 1 cap notice
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const bodies = fetchMock.mock.calls.map(c => JSON.parse((c as unknown as [string, { body: string }])[1].body).text as string)
    expect(bodies.filter(t => t.includes('alert cap reached'))).toHaveLength(1)
  })

  it('falls back to default 30 on a garbage env value', async () => {
    const { alerter, fetchMock } = make({}, { ALERT_MAX_PER_HOUR: 'abc' })
    for (let i = 0; i < 32; i++) await alerter.report(alert(`k${i}`))
    expect(fetchMock).toHaveBeenCalledTimes(31) // 30 + 1 cap notice
  })
})

describe('redis fallback', () => {
  it('dedupes in memory when redis throws', async () => {
    const redis = {
      set: vi.fn(async () => { throw new Error('down') }),
      incr: vi.fn(async () => { throw new Error('down') }),
      decr: vi.fn(async () => { throw new Error('down') }),
      del: vi.fn(async () => { throw new Error('down') }),
      get: vi.fn(async () => { throw new Error('down') }),
      expire: vi.fn(async () => { throw new Error('down') }),
    }
    const { alerter, fetchMock } = make({ redis })
    await alerter.report(alert())
    await alerter.report(alert())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dedupes in memory when redis is not configured', async () => {
    const { alerter, fetchMock } = make({ redis: null })
    await alerter.report(alert())
    await alerter.report(alert())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('memory cooldown expires', async () => {
    let t = Date.UTC(2026, 9, 24, 10, 0, 0)
    const { alerter, fetchMock } = make({ redis: null, now: () => t })
    await alerter.report(alert())
    t += 1801 * 1000
    await alerter.report(alert())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('sink isolation', () => {
  it('telegram failure does not throw or block history', async () => {
    const { alerter, insert } = make({ fetch: (async () => { throw new Error(`boom ${TOKEN}`) }) as unknown as typeof fetch })
    await expect(alerter.report(alert())).resolves.toBeUndefined()
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('supabase failure does not throw or block telegram', async () => {
    const { alerter, fetchMock } = make({ supabase: () => { throw new Error('no db') } })
    await expect(alerter.report(alert())).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('supabase returning an error (e.g. old CHECK) does not break telegram', async () => {
    const { alerter, fetchMock } = make({
      supabase: () => ({ from: () => ({ insert: async () => ({ error: { message: 'check violation' } }) }) }),
    })
    await alerter.report(alert())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves within ~4s when every sink hangs', async () => {
    vi.useFakeTimers()
    const never = new Promise<never>(() => {})
    const { alerter } = make({
      fetch: (() => never) as unknown as typeof fetch,
      supabase: () => never,
      sentry: () => never,
    })
    let done = false
    const p = alerter.report(alert()).then(() => { done = true })
    await vi.advanceTimersByTimeAsync(4100)
    await p
    expect(done).toBe(true)
    vi.useRealTimers()
  })

  it('calls sentry only for critical', async () => {
    const sentry = vi.fn()
    const { alerter } = make({ sentry })
    await alerter.report(alert('c'))
    await alerter.report(alert('w', { severity: 'warning' }))
    expect(sentry).toHaveBeenCalledTimes(1)
    expect(sentry).toHaveBeenCalledWith('Boom')
  })
})

describe('message formatting', () => {
  it('escapes HTML and truncates the body', () => {
    const text = buildTelegramText(
      { key: 'k', severity: 'warning', title: '<b>&', body: 'x'.repeat(5000), gymId: 'g<1>' },
      'production',
      Date.UTC(2026, 9, 24),
    )
    expect(text).toContain('WARNING: &lt;b&gt;&amp;')
    expect(text).toContain('gym: g&lt;1&gt;')
    expect(text).toContain('24 Oct 2026, 5:30 AM IST (00:00 UTC)')
    expect(text.length).toBeLessThan(4096)
    expect(text).not.toContain('x'.repeat(1600))
  })

  it('sends the documented Telegram payload', async () => {
    const { alerter, fetchMock } = make()
    await alerter.report(alert())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`)
    const payload = JSON.parse(init.body)
    expect(payload).toMatchObject({ chat_id: '42', parse_mode: 'HTML', disable_web_page_preview: true })
    expect(payload.text).toContain('CRITICAL: Boom')
  })
})

describe('logging hygiene', () => {
  it('never logs the bot token on telegram failure', async () => {
    const lines: string[] = []
    for (const m of ['error', 'warn', 'log'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')) })
    }
    const { alerter } = make({ fetch: (async () => { throw new Error(`fail ${TOKEN}`) }) as unknown as typeof fetch })
    await alerter.report(alert())
    const failure = lines.find(l => l.includes('telegram send failed'))
    expect(failure).toBeTruthy()
    expect(lines.join('\n')).not.toContain(TOKEN)
    expect(lines.some(l => l.includes('alertKey'))).toBe(true)
  })
})

describe('kill switch and test env', () => {
  it('ALERTS_DISABLED sends nothing', async () => {
    const { alerter, fetchMock, insert } = make({}, { ALERTS_DISABLED: '1' })
    await alerter.report(alert())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('NODE_ENV=test sends nothing', async () => {
    const { alerter, fetchMock } = make({}, { NODE_ENV: 'test' })
    await alerter.report(alert())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('public API never throws', () => {
  it('reportAlert resolves under vitest (NODE_ENV=test, disabled)', async () => {
    await expect(reportAlert(alert())).resolves.toBeUndefined()
  })
  it('reportAlertInBackground does not throw outside a request scope', () => {
    expect(() => reportAlertInBackground(alert())).not.toThrow()
  })
})

describe('redis timeout and bound', () => {
  it('falls back to memory and stays within ~4s when redis never resolves', async () => {
    vi.useFakeTimers()
    const never = () => new Promise<never>(() => {})
    const { alerter, fetchMock } = make({ redis: { set: never, get: never, incr: never, decr: never, expire: never, del: never } })
    const start = Date.now()
    const p = alerter.report(alert())
    await vi.advanceTimersByTimeAsync(4000)
    await p
    expect(Date.now() - start).toBeLessThanOrEqual(4000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('release and headroom', () => {
  it('releases the dedupe key when the cap is hit so it can retry', async () => {
    const redis = fakeRedis()
    const { alerter, fetchMock } = make({ redis }, { ALERT_MAX_PER_HOUR: '1' })
    await alerter.report(alert('a'))
    await alerter.report(alert('b'))
    expect(redis.store.has('alert:b')).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2) // a + cap notice
  })

  it('releases the dedupe key when telegram and history both fail', async () => {
    const redis = fakeRedis()
    const { alerter } = make({
      redis,
      fetch: (async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch,
      supabase: () => { throw new Error('db') },
    })
    await alerter.report(alert('f'))
    expect(redis.store.has('alert:f')).toBe(false)
  })

  it('keeps the dedupe key when only telegram fails but history succeeded', async () => {
    const redis = fakeRedis()
    const { alerter } = make({
      redis,
      fetch: (async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch,
    })
    await alerter.report(alert('h'))
    expect(redis.store.has('alert:h')).toBe(true)
  })

  // Repeat warnings (keys that alerted before) use 70% of the cap; criticals and first-time keys use all of it.
  for (const useRedis of [true, false]) {
    it(`repeat warnings stop at 70% of the cap, criticals do not (${useRedis ? 'redis' : 'memory'})`, async () => {
      let t = Date.UTC(2026, 9, 24, 10, 0, 0)
      const { alerter, insert } = make({ redis: useRedis ? fakeRedis(() => t) : null, now: () => t }, { ALERT_MAX_PER_HOUR: '10' })
      const w = (k: string) => alert(k, { severity: 'warning', cooldownSeconds: 60 })
      for (let i = 0; i < 5; i++) await alerter.report(w(`w${i}`)) // first time: 5 slots
      await alerter.report(alert('c0', { cooldownSeconds: 60 })) // 6
      expect(insert).toHaveBeenCalledTimes(6)
      t += 120_000
      for (let i = 0; i < 5; i++) await alerter.report(w(`w${i}`)) // repeats: only slot 7 fits the 70% share
      expect(insert).toHaveBeenCalledTimes(7)
      await alerter.report(alert('c0', { cooldownSeconds: 60 })) // critical repeat still allowed (8)
      expect(insert).toHaveBeenCalledTimes(8)
    })

    it(`a first-time key is delivered even when the warning share is exhausted (${useRedis ? 'redis' : 'memory'})`, async () => {
      let t = Date.UTC(2026, 9, 24, 10, 0, 0)
      const { alerter, insert } = make({ redis: useRedis ? fakeRedis(() => t) : null, now: () => t }, { ALERT_MAX_PER_HOUR: '10' })
      const w = (k: string) => alert(k, { severity: 'warning', cooldownSeconds: 60 })
      for (let i = 0; i < 6; i++) await alerter.report(w(`w${i}`))
      t += 120_000
      for (let i = 0; i < 6; i++) await alerter.report(w(`w${i}`)) // repeats exhaust the share (7 total)
      const before = insert.mock.calls.length
      expect(before).toBe(7)
      await alerter.report(w('brand-new'))
      expect(insert).toHaveBeenCalledTimes(before + 1)
    })
  }
})

describe('PII scrubbing', () => {
  it('redacts long digit runs, emails and tokens', () => {
    expect(scrubPii('call +91 98765 43210 now')).toBe('call [number] now')
    expect(scrubPii('9876543210')).toBe('[number]')
    expect(scrubPii('mail a.b@example.com x')).toBe('mail [email] x')
    expect(scrubPii('t eyJhbGciOi.eyJzdWIiOi.sig_-x end')).toBe('t [token] end')
    expect(scrubPii('Authorization: Bearer abc.DEF-123_x')).toBe('Authorization: [token]')
  })
  it('keeps uuids, short numbers and dates readable', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(scrubPii(`gym ${id} failed 1234567 times 42 at 2026-10-24`)).toBe(`gym ${id} failed 1234567 times 42 at 2026-10-24`)
  })
  it('keeps sentry.io links whole', () => {
    const url = 'https://gym-flow.sentry.io/issues/7123456789/events/ba2b27cbb16d4b19b7c6e61b081d27a8/'
    expect(scrubPii(`url: ${url} call 9876543210`)).toBe(`url: ${url} call [number]`)
  })
  it('does not re-capture sentry:* alerts into Sentry (would loop)', async () => {
    const sentry = vi.fn()
    const { alerter } = make({ sentry })
    await alerter.report(alert('sentry:event_alert'))
    expect(sentry).not.toHaveBeenCalled()
  })
  it('is applied to telegram, history, and sentry', async () => {
    const sentry = vi.fn()
    const { alerter, fetchMock, insert } = make({ sentry })
    await alerter.report(alert('p', { title: 'u a@b.co', body: 'phone 9876543210' }))
    const text = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).text as string
    expect(text).toContain('[email]')
    expect(text).toContain('[number]')
    expect(text).not.toContain('9876543210')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ title: 'u [email]', body: expect.stringContaining('phone [number]') }))
    expect(sentry).toHaveBeenCalledWith('u [email]')
  })
})

describe('real wiring of reportAlert', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.doUnmock('@/lib/supabase/admin')
    vi.doUnmock('@/lib/redis')
    vi.doUnmock('@sentry/nextjs')
    vi.resetModules()
  })

  async function setup(extra: Record<string, string> = {}) {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TELEGRAM_BOT_TOKEN', TOKEN)
    vi.stubEnv('TELEGRAM_CHAT_ID', '42')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v)
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    const insert = vi.fn(async () => ({ error: null }))
    const store = new Set<string>()
    const redis = {
      set: vi.fn(async (k: string) => (store.has(k) ? null : (store.add(k), 'OK'))),
      get: vi.fn(async () => null),
      incr: vi.fn(async () => 1),
      decr: vi.fn(async () => 0),
      expire: vi.fn(async () => 1),
      del: vi.fn(async () => 1),
    }
    vi.doMock('@/lib/redis', () => ({ redis }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert }) }) }))
    vi.doMock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
    const mod = await import('@/lib/monitoring/alert')
    return { mod, fetchMock, insert, redis }
  }

  it('sends telegram, inserts a notification and dedupes via redis', async () => {
    const { mod, fetchMock, insert, redis } = await setup()
    await mod.reportAlert({ key: 'real', severity: 'warning', title: 'T', body: 'B' })
    await mod.reportAlert({ key: 'real', severity: 'warning', title: 'T', body: 'B' })
    expect(redis.set).toHaveBeenCalledWith('alert:real', expect.any(String), { nx: true, ex: 21600 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ type: 'alert', entity_id: 'real' }))
  })

  it('ALERTS_DISABLED=1 blocks everything', async () => {
    const { mod, fetchMock, insert } = await setup({ ALERTS_DISABLED: '1' })
    await mod.reportAlert({ key: 'off', severity: 'critical', title: 'T', body: 'B' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})
