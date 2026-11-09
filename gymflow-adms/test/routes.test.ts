import { afterEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import type { Config } from '../src/config.js'

const config: Config = {
  port: 0,
  host: '127.0.0.1',
  ingestUrl: 'https://app.example.com/api/adms/ingest',
  ingestSecret: 'test-secret',
  tzMinutes: 330,
  logLevel: 'silent',
}

const ok = (known = true) =>
  new Response(JSON.stringify({ success: true, data: { known, accepted: 1 } }), { status: 200 })

let app: FastifyInstance
afterEach(async () => app?.close())

function setup(fetchImpl: typeof fetch, extra = {}) {
  app = buildApp(config, { fetchImpl, ...extra })
  return app
}

const LINE = '12\t2026-11-09 08:01:02\t0\t1\t0\r\n'

describe('GET cdata', () => {
  it('returns config text containing the serial and timezone', async () => {
    const res = await setup(vi.fn()).inject('/iclock/cdata?SN=TEST123&options=all')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body.split('\n')[0]).toBe('GET OPTION FROM: TEST123')
    expect(res.body).toContain('TimeZone=330')
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers.server).toBeUndefined()
  })

  it('ignores a bad SN with plain OK', async () => {
    const f = vi.fn()
    const res = await setup(f).inject('/iclock/cdata?SN=bad%20sn%3B')
    expect(res.body).toBe('OK')
    const missing = await app.inject('/iclock/cdata')
    expect(missing.body).toBe('OK')
  })

  it('supports the .aspx suffix', async () => {
    const res = await setup(vi.fn()).inject('/iclock/cdata.aspx?SN=TEST123&options=all')
    expect(res.body).toContain('GET OPTION FROM: TEST123')
  })
})

describe('POST cdata ATTLOG', () => {
  it('forwards the punches with the bearer header and replies OK:n', async () => {
    const f = vi.fn().mockImplementation(async () => ok())
    const res = await setup(f).inject({
      method: 'POST',
      url: '/iclock/cdata?SN=TEST123&table=ATTLOG&Stamp=1',
      payload: LINE + '13\t2026-11-09 08:02:00\t1\t15\r\n',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('OK:2')
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(config.ingestUrl)
    expect(init.headers.Authorization).toBe('Bearer test-secret')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      serial: 'TEST123',
      punches: [
        { pin: '12', time: '2026-11-09 08:01:02', status: 0, verify: 1 },
        { pin: '13', time: '2026-11-09 08:02:00', status: 1, verify: 15 },
      ],
    })
  })

  it('accepts gzip bodies with content-encoding', async () => {
    const f = vi.fn().mockImplementation(async () => ok())
    const res = await setup(f).inject({
      method: 'POST',
      url: '/iclock/cdata?SN=TEST123&table=ATTLOG',
      headers: { 'content-encoding': 'gzip', 'content-type': 'application/octet-stream' },
      payload: gzipSync(Buffer.from(LINE)),
    })
    expect(res.body).toBe('OK:1')
  })

  it('accepts key=value lines and chunks batches over 500', async () => {
    const f = vi.fn().mockImplementation(async () => ok())
    const lines = Array.from({ length: 501 }, (_, i) => `pin=${i + 1}\ttime=2026-11-09 08:01:02\tstatus=0\tverifytype=1`)
    const res = await setup(f).inject({
      method: 'POST',
      url: '/iclock/cdata.aspx?SN=TEST123&table=ATTLOG',
      payload: lines.join('\n'),
    })
    expect(res.body).toBe('OK:501')
    expect(f).toHaveBeenCalledTimes(2)
    expect(JSON.parse(f.mock.calls[0]![1].body).punches).toHaveLength(500)
  })

  it('replies 503 when the app answers 500', async () => {
    const f = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }))
    const res = await setup(f).inject({ method: 'POST', url: '/iclock/cdata?SN=TEST123&table=ATTLOG', payload: LINE })
    expect(res.statusCode).toBe(503)
  })

  it('replies 503 on timeout', async () => {
    const f = vi.fn(
      (_u: unknown, init: RequestInit) =>
        new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason))),
    )
    const res = await setup(f as unknown as typeof fetch, { timeoutMs: 30 }).inject({
      method: 'POST',
      url: '/iclock/cdata?SN=TEST123&table=ATTLOG',
      payload: LINE,
    })
    expect(res.statusCode).toBe(503)
  })

  it('replies 503 on a network error', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const res = await setup(f).inject({ method: 'POST', url: '/iclock/cdata?SN=TEST123&table=ATTLOG', payload: LINE })
    expect(res.statusCode).toBe(503)
  })

  it('still replies OK:n when the device is unknown to the app', async () => {
    const f = vi.fn().mockImplementation(async () => ok(false))
    const res = await setup(f).inject({ method: 'POST', url: '/iclock/cdata?SN=TEST123&table=ATTLOG', payload: LINE })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('OK:1')
  })

  it('does not call the app when every line is garbage', async () => {
    const f = vi.fn()
    const res = await setup(f).inject({ method: 'POST', url: '/iclock/cdata?SN=TEST123&table=ATTLOG', payload: 'junk\n' })
    expect(res.body).toBe('OK:0')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('other tables and endpoints', () => {
  it.each(['OPERLOG', 'USERINFO', 'ATTPHOTO', 'rtstate', 'whatever'])('drops table %s with OK', async (table) => {
    const f = vi.fn()
    const res = await setup(f).inject({
      method: 'POST',
      url: `/iclock/cdata?SN=TEST123&table=${table}`,
      headers: { 'content-type': 'text/plain' },
      payload: 'x=1',
    })
    expect(res.body).toBe('OK')
    expect(f).not.toHaveBeenCalled()
  })

  it('devicecmd, ping, healthz', async () => {
    setup(vi.fn())
    expect((await app.inject({ method: 'POST', url: '/iclock/devicecmd?SN=TEST123', payload: 'ID=1' })).body).toBe('OK')
    expect((await app.inject('/iclock/ping')).body).toBe('OK')
    const h = await app.inject('/healthz')
    expect(h.statusCode).toBe(200)
    expect(h.body).toBe('')
  })

  it('registry and push', async () => {
    setup(vi.fn())
    const a = await app.inject({ method: 'POST', url: '/iclock/registry?SN=TEST123', payload: 'x' })
    const b = await app.inject({ method: 'POST', url: '/iclock/registry?SN=TEST123', payload: 'y' })
    expect(a.body).toMatch(/^RegistryCode=[0-9a-f]+$/)
    expect(a.body).toBe(b.body)
    expect((await app.inject('/iclock/push?SN=TEST123')).body).toContain('GET OPTION FROM: TEST123')
  })

  it('returns 404 with empty body for unknown paths', async () => {
    const res = await setup(vi.fn()).inject('/nope')
    expect(res.statusCode).toBe(404)
    expect(res.body).toBe('')
  })

  it('rate limits per IP with 429', async () => {
    setup(vi.fn(), { rateLimit: { capacity: 2, refillPerSec: 0 } })
    expect((await app.inject('/iclock/ping')).statusCode).toBe(200)
    expect((await app.inject('/iclock/ping')).statusCode).toBe(200)
    expect((await app.inject('/iclock/ping')).statusCode).toBe(429)
  })
})

describe('getrequest heartbeat', () => {
  it('sends at most one heartbeat per serial per 60 s', async () => {
    const f = vi.fn().mockImplementation(async () => ok())
    let t = 1_000_000
    setup(f, { now: () => t })
    for (let i = 0; i < 3; i++) {
      const res = await app.inject('/iclock/getrequest?SN=TEST123')
      expect(res.body).toBe('OK')
    }
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ serial: 'TEST123', punches: [] })
    await app.inject('/iclock/getrequest.aspx?SN=OTHER1')
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2))
    t += 61_000
    await app.inject('/iclock/getrequest?SN=TEST123')
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(3))
  })

  it('still replies OK when the heartbeat fails', async () => {
    const f = vi.fn().mockRejectedValue(new Error('down'))
    const res = await setup(f).inject('/iclock/getrequest?SN=TEST123')
    expect(res.body).toBe('OK')
  })
})
