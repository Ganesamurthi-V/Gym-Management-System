import { describe, it, expect } from 'vitest'
import { PROBES } from '../src/config'
import { runOnce, type Env } from '../src/run'
import { openFooter, formatDigest } from '../src/telegram'

const MIN = 60_000
const NOW = 5000 * MIN
const noSleep = async () => {}
const url = (n: string) => PROBES.find((p) => p.name === n)!.url

function harness(initial: unknown, failing: string[]) {
  let blob = JSON.stringify(initial)
  const kv = {
    get: async () => JSON.parse(blob),
    put: async (_k: string, v: string) => {
      blob = v
    },
  } as unknown as KVNamespace
  const telegram: string[] = []
  const failUrls = new Set(failing.map(url))
  const fn = async (u: string, init?: RequestInit) => {
    if (u.startsWith('https://api.telegram.org/')) {
      telegram.push(JSON.parse(String(init?.body)).text)
      return new Response('{}')
    }
    const p = PROBES.find((x) => x.url === u)
    if (!p) return new Response('ok')
    if (failUrls.has(u)) return new Response('x', { status: 500 })
    if (p.expect.status === 401) return new Response('{}', { status: 401 })
    if (p.name === 'www-site') return new Response('GymFlow')
    if (p.name === 'api-health') return new Response('{"status":"healthy"}')
    if (p.name === 'api-watchdog') return new Response('{}')
    return new Response('ok')
  }
  const env: Env = { STATE: kv, TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', HEALTH_CHECK_SECRET: 'h' }
  return { run: (now: number) => runOnce(env, fn, now, noSleep), telegram, state: () => JSON.parse(blob) }
}

const open = (since: number, lastAlert: number) => ({ fails: 1, alerted: true, lastAlert, reason: 'status 500, expected 200', since })

describe('an open issue never delays a new one', () => {
  it('B alerts in the same run while A (inside its reminder window) is not re-sent', async () => {
    const h = harness({ lastRun: NOW, probes: { 'api-health': open(NOW - 30 * MIN, NOW - 10 * MIN) } }, ['api-health', 'app-login-page'])
    await h.run(NOW)
    expect(h.telegram).toHaveLength(1)
    expect(h.telegram[0]).toContain('[CRITICAL]</b> app-login-page')
    expect(h.telegram[0]).not.toContain('[CRITICAL]</b> api-health')
    expect(h.telegram[0]).toContain('Still open: api-health (30m)')
    expect(h.state().probes['api-health'].lastAlert).toBe(NOW - 10 * MIN)
    expect(h.state().probes['app-login-page'].alerted).toBe(true)
  })

  it('several new alerts go into one summary that also shows what is still open', async () => {
    const h = harness({ lastRun: NOW, probes: { 'api-health': open(NOW - 90 * MIN, NOW - 10 * MIN) } }, ['api-health', 'www-site', 'app-login-page', 'guard-members'])
    await h.run(NOW)
    expect(h.telegram).toHaveLength(1)
    for (const n of ['www-site', 'app-login-page', 'guard-members']) expect(h.telegram[0]).toContain(n)
    expect(h.telegram[0]).toContain('Still open: api-health (1h 30m)')
  })

  it("A's own reminder still fires on its 60-minute cadence next to a new alert", async () => {
    const h = harness({ lastRun: NOW, probes: { 'api-health': open(NOW - 120 * MIN, NOW - 60 * MIN) } }, ['api-health', 'app-login-page'])
    await h.run(NOW)
    expect(h.telegram).toHaveLength(2)
    expect(h.telegram.some((t) => t.includes('[CRITICAL, still down]</b> api-health'))).toBe(true)
    expect(h.telegram.some((t) => t.includes('[CRITICAL]</b> app-login-page'))).toBe(true)
    expect(h.state().probes['api-health'].lastAlert).toBe(NOW)
  })

  it('C recovering produces its recovered message in the same run as B failing', async () => {
    const h = harness({ lastRun: NOW, probes: { 'api-health': open(NOW - 120 * MIN, NOW - 10 * MIN), 'graph-proxy': { ...open(NOW - 50 * MIN, NOW - 5 * MIN) } } }, ['api-health', 'app-login-page'])
    await h.run(NOW)
    expect(h.telegram).toHaveLength(2)
    expect(h.telegram.some((t) => t.includes('[RECOVERED]</b> graph-proxy') && t.includes('down for about 50 min'))).toBe(true)
    expect(h.telegram.some((t) => t.includes('[CRITICAL]</b> app-login-page'))).toBe(true)
    expect(h.telegram.find((t) => t.includes('[RECOVERED]'))).not.toContain('Still open')
  })
})

describe('open issues footer', () => {
  it('is omitted when nothing else is open', async () => {
    const h = harness({ lastRun: NOW, probes: {} }, ['app-login-page'])
    await h.run(NOW)
    expect(h.telegram[0]).not.toContain('Still open')
  })

  it('stays short and counts the rest', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `some-long-probe-name-${i}`, since: NOW - (i + 1) * MIN }))
    const f = openFooter(many, NOW)
    expect(f.length).toBeLessThanOrEqual(300)
    expect(f).toMatch(/\+\d+ more$/)
    expect(openFooter([], NOW)).toBe('')
  })
})

describe('6-hourly digest', () => {
  it('is sent when something has been down 6h or more, then not again within 6h', async () => {
    const h = harness({ lastRun: NOW, probes: { 'api-health': open(NOW - 7 * 60 * MIN, NOW - 10 * MIN) } }, ['api-health'])
    await h.run(NOW)
    expect(h.telegram).toHaveLength(1)
    expect(h.telegram[0]).toContain('[STILL DOWN]')
    expect(h.telegram[0]).toContain('api-health')
    expect(h.telegram[0]).toContain('down about 7 h')
    expect(h.telegram[0]).toContain('First fix step:')
    expect(h.state().digestAt).toBe(NOW)
    await h.run(NOW + 5 * MIN)
    expect(h.telegram).toHaveLength(1)
    await h.run(NOW + 6 * 60 * MIN)
    expect(h.telegram.filter((t) => t.includes('[STILL DOWN]'))).toHaveLength(2)
  })

  it('is not sent for issues younger than 6 hours', async () => {
    const h = harness({ lastRun: NOW, probes: { 'api-health': open(NOW - 5 * 60 * MIN, NOW - 10 * MIN) } }, ['api-health'])
    await h.run(NOW)
    expect(h.telegram).toHaveLength(0)
    expect(h.state().digestAt).toBeUndefined()
  })

  it('formats within the Telegram limit', () => {
    const issues = Array.from({ length: 80 }, (_, i) => ({ name: `p${i}`, since: NOW - 7 * 60 * MIN, reason: 'timeout' }))
    expect(formatDigest(issues, NOW).length).toBeLessThanOrEqual(4096)
  })
})
