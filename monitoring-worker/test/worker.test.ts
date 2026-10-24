import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PROBES } from '../src/config'
import { classify, runProbe } from '../src/probe'
import { decide, emptyState } from '../src/state'
import { sendTelegram } from '../src/telegram'
import { runOnce, type Env } from '../src/run'
import worker from '../src/index'

const MIN = 60_000
const TOKEN = 'SECRET-BOT-TOKEN-123'
const noSleep = async () => {}

type Handler = () => Response | Promise<Response>

function defaults(): Record<string, Handler> {
  const h: Record<string, Handler> = {}
  for (const p of PROBES) {
    if (p.expect.status === 401) h[p.url] = () => new Response('{}', { status: 401 })
    else if (p.name === 'www-site') h[p.url] = () => new Response('<html>GymFlow</html>')
    else if (p.name === 'api-health') h[p.url] = () => new Response('{"status":"healthy"}')
    else if (p.name === 'api-watchdog') h[p.url] = () => new Response('{"status":"ok"}')
    else h[p.url] = () => new Response('ok')
  }
  return h
}

function makeFetch(over: Record<string, Handler> = {}) {
  const handlers = { ...defaults(), ...over }
  const calls: string[] = []
  const fn = async (input: string) => {
    calls.push(input)
    if (input.startsWith('https://api.telegram.org/')) return (handlers['telegram'] ?? (() => new Response('{}')))()
    if (input.startsWith('https://hb.example/')) return new Response('ok')
    const h = handlers[input]
    if (!h) throw new Error('unexpected url ' + input)
    return h()
  }
  return { fn, calls }
}

function makeKv(initial?: unknown) {
  let value = initial === undefined ? null : JSON.stringify(initial)
  const puts: string[] = []
  const kv = {
    get: async () => (value === null ? null : JSON.parse(value)),
    put: async (_k: string, v: string) => {
      value = v
      puts.push(v)
    },
  }
  return { kv: kv as unknown as KVNamespace, puts, read: () => (value ? JSON.parse(value) : null) }
}

const probe = (name: string) => PROBES.find((p) => p.name === name)!
const URL_OF = (name: string) => probe(name).url
const env = (kv: KVNamespace, extra: Partial<Env> = {}): Env => ({
  STATE: kv,
  TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_CHAT_ID: '42',
  HEALTH_CHECK_SECRET: 'hs',
  ...extra,
})
const telegramBodies = (f: ReturnType<typeof makeFetch>) => f.calls.filter((c) => c.includes('telegram')).length

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('probe logic', () => {
  it('keyword probe fails when the keyword is missing', () => {
    expect(classify({ status: 200, bodyIncludes: 'GymFlow' }, 200, '<html>other</html>')).toMatch(/keyword/)
    expect(classify({ status: 200, bodyIncludes: 'GymFlow' }, 200, 'GymFlow')).toBeNull()
  })

  it('401 guard passes only on 401 (200 and 500 are failures)', () => {
    const e = { status: 401 }
    expect(classify(e, 401, null)).toBeNull()
    expect(classify(e, 200, null)).not.toBeNull()
    expect(classify(e, 500, null)).not.toBeNull()
  })

  it('retries once after a 5xx and then passes', async () => {
    let n = 0
    const sleep = vi.fn(noSleep)
    const r = await runProbe(
      probe('app-login-page'),
      {},
      async () => (++n === 1 ? new Response('x', { status: 503 }) : new Response('ok')),
      sleep,
    )
    expect(r.ok).toBe(true)
    expect(n).toBe(2)
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('does not retry a 4xx mismatch and gives at most two attempts on errors', async () => {
    let n = 0
    const r1 = await runProbe(probe('guard-members'), {}, async () => (n++, new Response('x', { status: 200 })), noSleep)
    expect(r1.ok).toBe(false)
    expect(n).toBe(1)
    n = 0
    const r2 = await runProbe(probe('app-login-page'), {}, async () => { n++; throw new Error('boom') }, noSleep)
    expect(r2).toMatchObject({ ok: false, reason: 'network error' })
    expect(n).toBe(2)
  })

  it('reports a timeout and a missing health secret without calling the network', async () => {
    const t = await runProbe(probe('app-login-page'), {}, async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }) }, noSleep)
    expect(t.reason).toBe('timeout')
    const f = vi.fn()
    const m = await runProbe(probe('api-health-deep'), {}, f as never, noSleep)
    expect(m.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('sends the health secret header to deep health', async () => {
    let seen: string | undefined
    await runProbe(probe('api-health-deep'), { HEALTH_CHECK_SECRET: 'hs' }, async (_u, init) => {
      seen = (init?.headers as Record<string, string>)['x-health-secret']
      return new Response('{}')
    }, noSleep)
    expect(seen).toBe('hs')
  })
})

describe('state machine', () => {
  const fail = (name: string, critical: boolean) => ({ name, critical, ok: false, reason: 'status 500' })
  const ok = (name: string, critical: boolean) => ({ name, critical, ok: true, reason: '' })

  it('critical alerts on the first failing run', () => {
    const d = decide(emptyState(), [fail('a', true)], 1000 * MIN)
    expect(d.messages).toMatchObject([{ level: 'CRITICAL', name: 'a', reason: 'status 500', reminder: false }])
    expect(d.changed).toBe(true)
  })

  it('warning needs two consecutive failing runs', () => {
    const t0 = 1000 * MIN
    const d1 = decide(emptyState(), [fail('w', false)], t0)
    expect(d1.messages).toHaveLength(0)
    const d2 = decide(d1.next, [fail('w', false)], t0 + 5 * MIN)
    expect(d2.messages[0]).toMatchObject({ level: 'WARNING', name: 'w' })
  })

  it('a single blip between passes never alerts a warning probe', () => {
    const t0 = 1000 * MIN
    const d1 = decide(emptyState(), [fail('w', false)], t0)
    const d2 = decide(d1.next, [ok('w', false)], t0 + 5 * MIN)
    const d3 = decide(d2.next, [fail('w', false)], t0 + 10 * MIN)
    expect(d2.messages).toHaveLength(0)
    expect(d3.messages).toHaveLength(0)
  })

  it('sends RECOVERED only for probes that had alerted', () => {
    const t0 = 1000 * MIN
    const d1 = decide(emptyState(), [fail('a', true)], t0)
    const d2 = decide(d1.next, [ok('a', true)], t0 + 5 * MIN)
    expect(d2.messages).toMatchObject([{ level: 'RECOVERED', name: 'a', reason: 'status 500', reminder: false }])
    expect(d2.next.probes.a).toBeUndefined()
  })

  it('reminds after 60 minutes, not before, and does not write in between', () => {
    const t0 = 1000 * MIN
    let s = decide(emptyState(), [fail('a', true)], t0).next
    const mid = decide(s, [fail('a', true)], t0 + 30 * MIN)
    expect(mid.messages).toHaveLength(0)
    expect(mid.changed).toBe(false)
    const rem = decide(s, [fail('a', true)], t0 + 60 * MIN)
    expect(rem.messages[0]).toMatchObject({ level: 'CRITICAL', reminder: true })
    expect(rem.changed).toBe(true)
  })

  it('keeps state of probes that were not run (canary not due)', () => {
    const t0 = 1000 * MIN
    const s1 = decide(emptyState(), [fail('canary:login', true)], t0).next
    const s2 = decide(s1, [ok('other', true)], t0 + 5 * MIN).next
    expect(s2.probes['canary:login']).toBeDefined()
  })
})

describe('runOnce wiring', () => {
  it('does not write KV when everything is healthy and the stamp is fresh', async () => {
    const now = 5000 * MIN
    const k = makeKv({ lastRun: now - 5 * MIN, probes: {} })
    const f = makeFetch()
    await runOnce(env(k.kv), f.fn, now, noSleep)
    expect(k.puts).toHaveLength(0)
    expect(telegramBodies(f)).toBe(0)
  })

  it('writes once and alerts once when a critical probe fails, then not again', async () => {
    const now = 5000 * MIN
    const k = makeKv({ lastRun: now, probes: {} })
    const down = { [URL_OF('app-login-page')]: () => new Response('x', { status: 500 }) }
    const f = makeFetch(down)
    await runOnce(env(k.kv), f.fn, now, noSleep)
    expect(k.puts).toHaveLength(1)
    expect(telegramBodies(f)).toBe(1)
    const f2 = makeFetch(down)
    await runOnce(env(k.kv), f2.fn, now + 5 * MIN, noSleep)
    expect(k.puts).toHaveLength(1)
    expect(telegramBodies(f2)).toBe(0)
  })

  it('swallows Telegram failures and still saves state and heartbeats', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const k = makeKv({ lastRun: 0, probes: {} })
    const f = makeFetch({
      [URL_OF('api-health')]: () => new Response('x', { status: 500 }),
      telegram: () => { throw new Error(`fetch failed for https://api.telegram.org/bot${TOKEN}/sendMessage`) },
    })
    await expect(
      runOnce(env(k.kv, { BETTERSTACK_HEARTBEAT_URL: 'https://hb.example/abc' }), f.fn, 5000 * MIN, noSleep),
    ).resolves.toBeUndefined()
    expect(k.puts).toHaveLength(1)
    expect(f.calls).toContain('https://hb.example/abc')
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).not.toContain(TOKEN)
    expect(logged).toContain('redacted')
  })

  it('skips the heartbeat silently when the URL is unset', async () => {
    const k = makeKv({ lastRun: 5000 * MIN, probes: {} })
    const f = makeFetch()
    await runOnce(env(k.kv), f.fn, 5000 * MIN, noSleep)
    expect(f.calls.some((c) => c.includes('hb.example'))).toBe(false)
  })

  it('canary runs at most every 14 minutes and never logs credentials', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const now = 5000 * MIN
    const k = makeKv({ lastRun: now, probes: {} })
    const A = 'https://app.gymflow.sbs'
    const mk = () => {
      const f = makeFetch({
        [`${A}/api/auth/login`]: () => {
          const h = new Headers()
          h.append('set-cookie', 'sb-x-auth-token=SESSIONVALUE; Path=/; HttpOnly')
          return new Response('{"success":true,"role":"owner"}', { status: 200, headers: h })
        },
        [`${A}/api/dashboard/expiring`]: () => new Response('{"success":true}'),
        [`${A}/api/auth/signout`]: () => new Response('{}'),
      })
      return f
    }
    const e = env(k.kv, { CANARY_EMAIL: 'c@x.in', CANARY_PASSWORD: 'PW-SECRET' })
    // /api/dashboard/expiring is also the guard URL; the canary overrides it, so only check login count.
    const f1 = mk()
    await runOnce(e, f1.fn, now, noSleep, true)
    expect(f1.calls.filter((c) => c.endsWith('/api/auth/login'))).toHaveLength(1)
    const f2 = mk()
    await runOnce(e, f2.fn, now + 5 * MIN, noSleep, true)
    expect(f2.calls.filter((c) => c.endsWith('/api/auth/login'))).toHaveLength(0)
    const f3 = mk()
    await runOnce(e, f3.fn, now + 15 * MIN, noSleep, true)
    expect(f3.calls.filter((c) => c.endsWith('/api/auth/login'))).toHaveLength(1)
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/PW-SECRET|SESSIONVALUE/)
  })

  it('does not run the canary when disabled', async () => {
    const k = makeKv({ lastRun: 5000 * MIN, probes: {} })
    const f = makeFetch()
    await runOnce(env(k.kv, { CANARY_EMAIL: 'c@x.in', CANARY_PASSWORD: 'p' }), f.fn, 5000 * MIN, noSleep, false)
    expect(f.calls.some((c) => c.endsWith('/api/auth/login'))).toBe(false)
  })
})

describe('telegram', () => {
  it('escapes HTML and never throws on network failure', async () => {
    const bodies: string[] = []
    await sendTelegram({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '1' }, '<b>x</b>', async (_u, init) => {
      bodies.push(String(init?.body))
      return new Response('{}')
    })
    expect(bodies[0]).toContain('parse_mode')
    const r = await sendTelegram({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '1' }, 'x', async () => { throw new Error('down') })
    expect(r).toBe(false)
  })
})

describe('fetch handler', () => {
  const k = makeKv({ lastRun: Date.UTC(2026, 9, 24), probes: { a: { reason: TOKEN } } })
  const e = env(k.kv)

  it('404s everything except GET /health', async () => {
    for (const [m, p] of [['GET', '/'], ['POST', '/health'], ['GET', '/state'], ['GET', '/health/x']] as const) {
      const r = await worker.fetch(new Request('https://w.example' + p, { method: m }), e)
      expect(r.status).toBe(404)
    }
  })

  it('/health returns ok and last run, with no secrets or probe states', async () => {
    const r = await worker.fetch(new Request('https://w.example/health'), e)
    const text = await r.text()
    expect(r.status).toBe(200)
    expect(text).toContain('ok')
    expect(text).toContain('2026-10-24')
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain('probes')
  })
})

describe('subrequest budget', () => {
  const A = 'https://app.gymflow.sbs'
  const allDown = () => {
    const o: Record<string, Handler> = {}
    for (const p of PROBES) o[p.url] = () => new Response('x', { status: 500 })
    return o
  }

  it('worst case (everything failing with retries, canary on) stays within 45 fetches', async () => {
    const k = makeKv({ lastRun: 0, probes: {} })
    const f = makeFetch({
      ...allDown(),
      [`${A}/api/auth/login`]: () => {
        const h = new Headers()
        h.append('set-cookie', 'sb-x=v; Path=/')
        return new Response('{"success":true,"role":"owner"}', { headers: h })
      },
      [`${A}/api/auth/signout`]: () => new Response('{}'),
    })
    await runOnce(env(k.kv, { CANARY_EMAIL: 'c@x.in', CANARY_PASSWORD: 'p', BETTERSTACK_HEARTBEAT_URL: 'https://hb.example/a' }), f.fn, 5000 * MIN, noSleep, true)
    expect(f.calls.length).toBeLessThanOrEqual(45)
    expect(f.calls).toContain('https://hb.example/a')
  })

  it('batches many alerts into one Telegram message', async () => {
    const k = makeKv({ lastRun: 0, probes: {} })
    const f = makeFetch(allDown())
    await runOnce(env(k.kv), f.fn, 5000 * MIN, noSleep)
    expect(telegramBodies(f)).toBe(1)
  })

  it('skips low-priority probes, keeps their state, mentions it, still sends the heartbeat', async () => {
    const prevState = { fail: 1, alerted: true, lastAlert: 5000 * MIN, reason: 'status 500', since: 0 }
    const k = makeKv({ lastRun: 5000 * MIN, probes: { 'status-page': { ...prevState, fails: 2 } } })
    const sent: string[] = []
    const base = makeFetch({
      ...allDown(),
      telegram: () => new Response('{}'),
    })
    const fn = async (u: string, init?: RequestInit) => {
      if (u.includes('telegram')) sent.push(String(init?.body))
      return base.fn(u)
    }
    await runOnce(env(k.kv, { BETTERSTACK_HEARTBEAT_URL: 'https://hb.example/a' }), fn, 5000 * MIN + MIN, noSleep, false, 8)
    expect(base.calls).toContain('https://hb.example/a')
    expect(base.calls.length).toBeLessThanOrEqual(8)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('probes skipped (subrequest budget)')
    expect(k.read().probes['status-page'].alerted).toBe(true)
    expect(telegramBodies(base)).toBe(1)
  })
})

describe('alert delivery and KV failure', () => {
  it('Telegram down at first failure: not marked alerted, retried next run, then recovery works', async () => {
    const k = makeKv({ lastRun: 5000 * MIN, probes: {} })
    const down = { [URL_OF('app-login-page')]: () => new Response('x', { status: 500 }) }
    const f1 = makeFetch({ ...down, telegram: () => new Response('no', { status: 502 }) })
    await runOnce(env(k.kv), f1.fn, 5000 * MIN, noSleep)
    expect(k.read().probes['app-login-page'].alerted).toBe(false)
    const f2 = makeFetch(down)
    await runOnce(env(k.kv), f2.fn, 5005 * MIN, noSleep)
    expect(telegramBodies(f2)).toBe(1)
    expect(k.read().probes['app-login-page'].alerted).toBe(true)
    // recovery send fails: state kept so recovery is retried
    const f3 = makeFetch({ telegram: () => new Response('no', { status: 502 }) })
    await runOnce(env(k.kv), f3.fn, 5010 * MIN, noSleep)
    expect(k.read().probes['app-login-page']?.alerted).toBe(true)
    const f4 = makeFetch()
    await runOnce(env(k.kv), f4.fn, 5015 * MIN, noSleep)
    expect(telegramBodies(f4)).toBe(1)
    expect(k.read().probes['app-login-page']).toBeUndefined()
  })

  it('KV read failure: one labelled summary, no state write', async () => {
    const puts: string[] = []
    const kv = {
      get: async () => { throw new Error('kv down') },
      put: async (_k: string, v: string) => { puts.push(v) },
    } as unknown as KVNamespace
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const bodies: string[] = []
    const base = makeFetch(Object.fromEntries(PROBES.slice(0, 4).map((p) => [p.url, () => new Response('x', { status: 500 })])))
    const fn = async (u: string, init?: RequestInit) => {
      if (u.includes('telegram')) bodies.push(String(init?.body))
      return base.fn(u)
    }
    await runOnce(env(kv), fn, 5000 * MIN, noSleep)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toContain('unavailable')
    expect(puts).toHaveLength(0)
  })
})
