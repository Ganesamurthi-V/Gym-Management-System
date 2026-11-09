import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import worker, { type Env } from '../src/index.ts'

const env: Env = {
  ADMS_INGEST_SECRET: 'test-secret',
  APP_INGEST_URL: 'https://app.example.com/api/devices/punches',
  POLL_DELAY_SECONDS: '45',
  DEVICE_TZ_MINUTES: '330',
}

const ok = (known = true) =>
  new Response(JSON.stringify({ success: true, data: { known, accepted: 1 } }), { status: 200 })

const LINE = '12\t2026-11-09 08:01:02\t0\t1\t0\r\n'
const BASE = 'https://bio.example.com'

function makeCtx() {
  const pending: Promise<unknown>[] = []
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext,
    settle: () => Promise.all(pending),
  }
}

async function call(path: string, init: RequestInit = {}) {
  const { ctx, settle } = makeCtx()
  const res = await worker.fetch(new Request(BASE + path, init), env, ctx)
  await settle()
  return res
}

const store = new Map<string, Response>()
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  store.clear()
  vi.stubGlobal('caches', {
    default: {
      match: async (k: Request) => store.get(k.url)?.clone(),
      put: async (k: Request, r: Response) => void store.set(k.url, r),
    },
  })
  fetchMock = vi.fn(async () => ok())
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const sent = (i = 0) => JSON.parse(fetchMock.mock.calls[i]![1].body as string)

describe('GET cdata', () => {
  it('returns config text with the serial, delay and timezone', async () => {
    const res = await call('/iclock/cdata?SN=TEST123&options=all')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const body = await res.text()
    expect(body.split('\n')[0]).toBe('GET OPTION FROM: TEST123')
    expect(body).toContain('Delay=45')
    expect(body).toContain('TimeZone=330')
    expect(res.headers.get('server')).toBeNull()
  })

  it('works with the .aspx suffix', async () => {
    expect(await (await call('/iclock/cdata.aspx?SN=A1')).text()).toContain('GET OPTION FROM: A1')
  })

  it('ignores a bad SN with plain OK', async () => {
    expect(await (await call('/iclock/cdata?SN=bad%20sn!')).text()).toBe('OK')
    expect(await (await call('/iclock/cdata')).text()).toBe('OK')
  })
})

describe('POST cdata ATTLOG', () => {
  const post = (body: BodyInit, path = '/iclock/cdata?SN=S1&table=ATTLOG', headers: HeadersInit = {}) =>
    call(path, { method: 'POST', body, headers })

  it('forwards classic lines with the bearer header and replies OK:n', async () => {
    const res = await post(LINE + '13\t2026-11-09 09:00:00\t1\t1\t0\r\n')
    expect(await res.text()).toBe('OK:2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(env.APP_INGEST_URL)
    expect(init.headers.Authorization).toBe('Bearer test-secret')
    expect(sent()).toEqual({
      serial: 'S1',
      punches: [
        { pin: '12', time: '2026-11-09 08:01:02', status: 0, verify: 1 },
        { pin: '13', time: '2026-11-09 09:00:00', status: 1, verify: 1 },
      ],
    })
  })

  it('handles key=value bodies', async () => {
    const res = await post('pin=7\ttime=2026-11-09 08:01:02\tstatus=0\tverifytype=1\n')
    expect(await res.text()).toBe('OK:1')
    expect(sent().punches[0]).toEqual({ pin: '7', time: '2026-11-09 08:01:02', status: 0, verify: 1 })
  })

  it('handles gzip via content-encoding and via magic bytes', async () => {
    const gz = gzipSync(Buffer.from(LINE))
    expect(await (await post(gz, undefined, { 'content-encoding': 'gzip' })).text()).toBe('OK:1')
    expect(await (await post(gz)).text()).toBe('OK:1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent(1).punches[0].pin).toBe('12')
  })

  it('skips garbage lines and does not forward an empty result', async () => {
    const res = await post('garbage\r\n\r\n')
    expect(await res.text()).toBe('OK:0')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('chunks more than 500 punches', async () => {
    const body = Array.from({ length: 501 }, (_, i) => `${i + 1}\t2026-11-09 08:01:02\t0\t1`).join('\n')
    expect(await (await post(body)).text()).toBe('OK:501')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent(0).punches).toHaveLength(500)
    expect(sent(1).punches).toHaveLength(1)
  })

  it('replies OK:n when the app says the device is unknown', async () => {
    fetchMock.mockResolvedValue(ok(false))
    expect(await (await post(LINE)).text()).toBe('OK:1')
  })

  it('replies 503 ERROR when the app returns 500', async () => {
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }))
    const res = await post(LINE)
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('ERROR')
  })

  it('never follows redirects with the secret, and treats a 3xx as a failure', async () => {
    // 'manual' is the only no-follow value the Workers runtime accepts ('error' throws there).
    fetchMock.mockResolvedValue(new Response(null, { status: 301, headers: { location: 'https://elsewhere.example' } }))
    const res = await post(LINE)
    expect(fetchMock.mock.calls[0]![1].redirect).toBe('manual')
    expect(res.status).toBe(503)
  })

  it('replies 503 when success is not true', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }))
    expect((await post(LINE)).status).toBe(503)
  })

  it('replies 503 on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'))
    expect((await post(LINE)).status).toBe(503)
  })

  it('replies 503 on timeout', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    expect((await post(LINE)).status).toBe(503)
  })

  it('replies OK for other tables without forwarding', async () => {
    const res = await post('whatever', '/iclock/cdata?SN=S1&table=OPERLOG')
    expect(await res.text()).toBe('OK')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('works with the .aspx suffix', async () => {
    expect(await (await post(LINE, '/iclock/cdata.aspx?SN=S1&table=ATTLOG')).text()).toBe('OK:1')
  })

  it('ignores a bad SN without forwarding', async () => {
    expect(await (await post(LINE, '/iclock/cdata?SN=a%20b&table=ATTLOG')).text()).toBe('OK')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a body over 1 MB', async () => {
    const res = await post('x'.repeat(1024 * 1024 + 1))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('GET getrequest', () => {
  it('sends one empty-punch heartbeat per minute per serial and replies OK', async () => {
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
    expect(await (await call('/iclock/getrequest.aspx?SN=S1')).text()).toBe('OK')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sent()).toEqual({ serial: 'S1', punches: [] })
    await call('/iclock/getrequest?SN=S2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('still replies OK and heartbeats when the cache throws', async () => {
    vi.stubGlobal('caches', { default: { match: async () => { throw new Error('boom') }, put: async () => {} } })
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('replies OK even when the heartbeat fails', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
  })

  it('does not heartbeat for a bad SN', async () => {
    expect(await (await call('/iclock/getrequest?SN=!!')).text()).toBe('OK')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('other routes', () => {
  it('ping, devicecmd and healthz', async () => {
    expect(await (await call('/iclock/ping')).text()).toBe('OK')
    expect(await (await call('/iclock/devicecmd?SN=S1', { method: 'POST', body: 'x' })).text()).toBe('OK')
    const h = await call('/healthz')
    expect(h.status).toBe(200)
    expect(await h.text()).toBe('')
  })

  it('registry and push', async () => {
    const reg = await (await call('/iclock/registry?SN=S1', { method: 'POST' })).text()
    expect(reg).toMatch(/^RegistryCode=[0-9a-f]{20}$/)
    expect(await (await call('/iclock/push?SN=S1')).text()).toContain('GET OPTION FROM: S1')
    expect(await (await call('/iclock/push?SN=S1', { method: 'POST' })).text()).toContain('Delay=45')
  })

  it('returns an empty 404 for unknown paths', async () => {
    for (const p of ['/', '/admin', '/iclock/nope', '/iclock/getrequest.php']) {
      const res = await call(p)
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('')
    }
  })
})
