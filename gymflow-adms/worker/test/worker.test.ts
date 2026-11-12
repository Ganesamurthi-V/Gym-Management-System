import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
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
    expect(body).not.toContain('TimeZone')
    expect(body).toContain('ATTPHOTOStamp=9999')
    expect(body).toContain('OPERLOGStamp=9999')
    expect(res.headers.get('server')).toBeNull()
  })

  it('defaults the poll delay to 60 seconds', async () => {
    const { ctx } = makeCtx()
    const res = await worker.fetch(new Request(`${BASE}/iclock/cdata?SN=A1`), { ...env, POLL_DELAY_SECONDS: undefined }, ctx)
    expect(await res.text()).toContain('Delay=60')
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
    expect(await res.text()).toBe('OK: 2')
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
    expect(await res.text()).toBe('OK: 1')
    expect(sent().punches[0]).toEqual({ pin: '7', time: '2026-11-09 08:01:02', status: 0, verify: 1 })
  })

  it('handles gzip via content-encoding and via magic bytes', async () => {
    const gz = gzipSync(Buffer.from(LINE))
    expect(await (await post(gz, undefined, { 'content-encoding': 'gzip' })).text()).toBe('OK: 1')
    expect(await (await post(gz)).text()).toBe('OK: 1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent(1).punches[0].pin).toBe('12')
  })

  it('skips garbage lines and does not forward an empty result', async () => {
    const res = await post('garbage\r\n\r\n')
    expect(await res.text()).toBe('OK: 0')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  const lines = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}\t2026-11-09 08:01:02\t0\t1`).join('\n')

  it('chunks more than 100 punches', async () => {
    expect(await (await post(lines(101))).text()).toBe('OK: 101')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent(0).punches).toHaveLength(100)
    expect(sent(1).punches).toHaveLength(1)
  })

  it('accepts exactly 2000 punches and rejects 2001 with an empty 400', async () => {
    expect(await (await post(lines(2000))).text()).toBe('OK: 2000')
    expect(fetchMock).toHaveBeenCalledTimes(20)
    fetchMock.mockClear()
    const res = await post(lines(2001))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a declared Content-Length over 1 MB before reading the body', async () => {
    const res = await post(LINE, undefined, { 'content-length': String(1024 * 1024 + 1) })
    expect(res.status).toBe(413)
    expect(await res.text()).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enforces the byte cap while streaming when there is no Content-Length', async () => {
    const chunk = new Uint8Array(600 * 1024).fill(32)
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (++pulled > 10) return c.close()
        c.enqueue(chunk)
      },
    })
    const res = await call('/iclock/cdata?SN=S1&table=ATTLOG', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    expect(res.status).toBe(400)
    expect(pulled).toBeLessThan(10) // aborted early, did not drain the whole stream
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('replies OK:n when the app says the device is unknown', async () => {
    fetchMock.mockResolvedValue(ok(false))
    expect(await (await post(LINE)).text()).toBe('OK: 1')
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

  it.each(['ATTPHOTO', 'BIODATA', 'OPERLOG'])('drops table=%s without reading or forwarding the body', async (table) => {
    const { ctx } = makeCtx()
    const req = new Request(`${BASE}/iclock/cdata?SN=S1&table=${table}`, { method: 'POST', body: LINE })
    const getReader = vi.spyOn(req.body!, 'getReader')
    const res = await worker.fetch(req, env, ctx)
    expect(await res.text()).toBe('OK')
    expect(getReader).not.toHaveBeenCalled()
    expect(req.bodyUsed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('works with the .aspx suffix', async () => {
    expect(await (await post(LINE, '/iclock/cdata.aspx?SN=S1&table=ATTLOG')).text()).toBe('OK: 1')
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

describe('negative cache for unregistered serials', () => {
  const post = (path = '/iclock/cdata?SN=S1&table=ATTLOG') => call(path, { method: 'POST', body: LINE })

  it('stops calling the app after the first known:false and answers per route', async () => {
    fetchMock.mockResolvedValue(ok(false))
    expect(await (await post()).text()).toBe('OK: 1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.get('https://unknown.invalid/S1')?.headers.get('cache-control')).toBe('max-age=120')
    expect(await (await post()).text()).toBe('OK')
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
    expect(await (await call('/iclock/cdata?SN=S1')).text()).toContain('GET OPTION FROM: S1')
    expect(await (await call('/iclock/push?SN=S1')).text()).toContain('GET OPTION FROM: S1')
    expect(await (await call('/iclock/registry?SN=S1', { method: 'POST' })).text()).toMatch(/^RegistryCode=/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('records an unknown serial from a heartbeat too, and is per serial', async () => {
    fetchMock.mockResolvedValue(ok(false))
    await call('/iclock/getrequest?SN=S1')
    expect(store.has('https://unknown.invalid/S1')).toBe(true)
    fetchMock.mockResolvedValue(ok(true))
    expect(await (await post('/iclock/cdata?SN=S2&table=ATTLOG')).text()).toBe('OK: 1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache a known serial', async () => {
    await post()
    expect(store.has('https://unknown.invalid/S1')).toBe(false)
    expect(await (await post()).text()).toBe('OK: 1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('works again once the entry is gone (expiry)', async () => {
    fetchMock.mockResolvedValue(ok(false))
    await post()
    store.clear()
    fetchMock.mockResolvedValue(ok(true))
    expect(await (await post()).text()).toBe('OK: 1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls through to the app when the cache throws', async () => {
    vi.stubGlobal('caches', { default: { match: async () => { throw new Error('boom') }, put: async () => { throw new Error('boom') } } })
    fetchMock.mockImplementation(async () => ok(false))
    expect(await (await post()).text()).toBe('OK: 1')
    expect(await (await post()).text()).toBe('OK: 1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('TimeZone opt-in', () => {
  const cfg = async (e: Env) =>
    (await (await worker.fetch(new Request(`${BASE}/iclock/cdata?SN=A1`), e, makeCtx().ctx)).text()).split('\n')
  it('has no TimeZone line by default', async () => {
    expect((await cfg(env)).some((l) => l.startsWith('TimeZone'))).toBe(false)
  })
  it('DEVICE_TZ_HOURS=5 adds TimeZone=5', async () => {
    expect(await cfg({ ...env, DEVICE_TZ_HOURS: '5' })).toContain('TimeZone=5')
  })
  it.each(['abc', '5.5', '99', ''])('ignores invalid value %j', async (v) => {
    expect((await cfg({ ...env, DEVICE_TZ_HOURS: v })).some((l) => l.startsWith('TimeZone'))).toBe(false)
  })
})

describe('clock drift log', () => {
  const wall = (offsetMin: number) =>
    new Date(Date.now() + 330 * 60000 + offsetMin * 60000).toISOString().slice(0, 19).replace('T', ' ')
  const drift = () =>
    vi.mocked(console.log).mock.calls.map((c) => JSON.parse(String(c[0]))).find((j) => j.msg === 'attlog')!.newest_vs_now_min
  const line = (pin: string, t: string) => `${pin}\t${t}\t0\t1\t0\r\n`
  it('logs 0 when the newest punch equals server local now', async () => {
    await call('/iclock/cdata?SN=A1&table=ATTLOG', { method: 'POST', body: line('77', wall(0)) })
    expect(Math.abs(drift())).toBeLessThanOrEqual(1)
  })
  it('logs about 150 for a device clock 150 minutes ahead, using the newest punch', async () => {
    const body = line('77', wall(150)) + line('78', wall(-600))
    await call('/iclock/cdata?SN=A1&table=ATTLOG', { method: 'POST', body })
    expect(Math.abs(drift() - 150)).toBeLessThanOrEqual(1)
  })
  it('never logs the punch string or the PIN', async () => {
    const t = wall(150)
    await call('/iclock/cdata?SN=A1&table=ATTLOG', { method: 'POST', body: line('7712', t) })
    for (const c of vi.mocked(console.log).mock.calls) {
      expect(String(c[0])).not.toContain(t)
      expect(String(c[0])).not.toContain('7712')
    }
  })
})

describe('logging', () => {
  it('logs a short sha256 tag instead of the serial, never pins or bodies', async () => {
    const sn = 'SERIAL99'
    const tag = createHash('sha256').update(sn).digest('hex').slice(0, 8)
    await call(`/iclock/cdata?SN=${sn}&table=ATTLOG`, { method: 'POST', body: LINE })
    fetchMock.mockRejectedValue(new Error('down'))
    await call(`/iclock/cdata?SN=${sn}&table=ATTLOG`, { method: 'POST', body: LINE })
    await call(`/iclock/getrequest?SN=${sn}`)
    const lines = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.warn).mock.calls].map((c) => String(c[0]))
    expect(lines.length).toBeGreaterThanOrEqual(3)
    for (const l of lines) {
      expect(l).toContain(tag)
      expect(l).not.toContain(sn)
      expect(l).not.toContain('2026-11-09')
    }
  })
})

const cmdsRes = (commands: { id: number; line: string }[], known = true) =>
  new Response(JSON.stringify({ success: true, data: { known, commands } }), { status: 200 })
const parsedBody = (i: number) => JSON.parse(fetchMock.mock.calls[i]![1].body as string)

describe('GET getrequest', () => {
  it('asks the app for commands on every poll and replies OK when there are none', async () => {
    fetchMock.mockImplementation(async () => cmdsRes([]))
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
    expect(await (await call('/iclock/getrequest.aspx?SN=S1')).text()).toBe('OK')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://app.example.com/api/devices/commands/next')
    expect(init.redirect).toBe('manual')
    expect(init.headers.Authorization).toBe('Bearer test-secret')
    expect(parsedBody(0)).toEqual({ serial: 'S1' })
  })

  it('returns the command lines joined by newlines', async () => {
    fetchMock.mockImplementation(async () =>
      cmdsRes([
        { id: 1, line: 'C:1:DATA UPDATE USERINFO PIN=5\tName=Asha\tPrivilege=0' },
        { id: 2, line: 'C:2:DATA DELETE USERINFO PIN=6' },
      ]),
    )
    const res = await call('/iclock/getrequest?SN=S1')
    expect(await res.text()).toBe('C:1:DATA UPDATE USERINFO PIN=5\tName=Asha\tPrivilege=0\nC:2:DATA DELETE USERINFO PIN=6')
  })

  it('drops malformed lines from the app', async () => {
    fetchMock.mockImplementation(async () => cmdsRes([{ id: 1, line: 'C:1:OK\nC:2:evil' }, { id: 3, line: 'junk' }]))
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
  })

  it('replies OK and logs only the reason when the app fails', async () => {
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }))
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
    const warns = vi.mocked(console.warn).mock.calls.map((c) => String(c[0]))
    expect(warns[0]).toContain('app status 500')
    expect(warns[1]).toContain('TimeoutError')
  })

  it('marks the serial unknown when the app says so, then skips the app', async () => {
    fetchMock.mockImplementation(async () => cmdsRes([], false))
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
    expect(store.has('https://unknown.invalid/S1')).toBe(true)
    expect(await (await call('/iclock/getrequest?SN=S1')).text()).toBe('OK')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not call the app for a bad SN', async () => {
    expect(await (await call('/iclock/getrequest?SN=!!')).text()).toBe('OK')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST devicecmd', () => {
  const dc = (body: string, path = '/iclock/devicecmd?SN=S1') => call(path, { method: 'POST', body })
  const acked = () => fetchMock.mock.calls.map((c, i) => ({ url: String(c[0]), body: parsedBody(i) }))

  it('forwards a single result to /commands/ack and replies OK', async () => {
    const res = await dc('ID=12&Return=0&CMD=DATA')
    expect(await res.text()).toBe('OK')
    expect(acked()).toEqual([
      { url: 'https://app.example.com/api/devices/commands/ack', body: { serial: 'S1', results: [{ id: 12, ret: 0 }] } },
    ])
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer test-secret')
  })

  it('parses several records, including a negative Return, on lines and joined by &', async () => {
    await dc('ID=1&Return=0&CMD=DATA\r\nID=2&Return=-1002&CMD=DATA\nID=3&Return=0&CMD=DATA&ID=4&Return=1&CMD=DATA')
    expect(acked()[0]!.body.results).toEqual([
      { id: 1, ret: 0 },
      { id: 2, ret: -1002 },
      { id: 3, ret: 0 },
      { id: 4, ret: 1 },
    ])
  })

  it('ignores garbage and malformed records, and does not call the app when nothing is valid', async () => {
    expect(await (await dc('hello\nID=x&Return=0\nID=5\nReturn=1\nID=6&Return=abc')).text()).toBe('OK')
    expect(fetchMock).not.toHaveBeenCalled()
    await dc('junk\nID=7&Return=0&CMD=DATA')
    expect(acked()[0]!.body.results).toEqual([{ id: 7, ret: 0 }])
  })

  it('caps the forwarded results at 50', async () => {
    await dc(Array.from({ length: 80 }, (_, i) => `ID=${i + 1}&Return=0`).join('\n'))
    expect(acked()[0]!.body.results).toHaveLength(50)
  })

  it('replies OK even when the ack fails, and never logs the body', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    expect(await (await dc('ID=12&Return=0&CMD=SECRETCMD')).text()).toBe('OK')
    const logs = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.warn).mock.calls].map((c) => String(c[0]))
    for (const l of logs) expect(l).not.toContain('SECRETCMD')
  })

  it('replies OK for a bad SN without calling the app', async () => {
    expect(await (await dc('ID=1&Return=0', '/iclock/devicecmd?SN=!!')).text()).toBe('OK')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fdata and other tables', () => {
  it('acknowledges /iclock/fdata without reading the body', async () => {
    const { ctx } = makeCtx()
    const req = new Request(`${BASE}/iclock/fdata?SN=S1`, { method: 'POST', body: 'binary' })
    const res = await worker.fetch(req, env, ctx)
    expect(await res.text()).toBe('OK')
    expect(req.bodyUsed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['USERINFO', 'FINGERTMP', 'FACE', 'rtlog', 'whatever'])('table=%s is answered OK unread', async (table) => {
    const { ctx } = makeCtx()
    const req = new Request(`${BASE}/iclock/cdata?SN=S1&table=${table}`, { method: 'POST', body: LINE })
    expect(await (await worker.fetch(req, env, ctx)).text()).toBe('OK')
    expect(req.bodyUsed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('protocol details', () => {
  it('config text carries the full key set in order, with defaults', async () => {
    const { ctx } = makeCtx()
    const e = { ...env, POLL_DELAY_SECONDS: undefined }
    const t0 = Math.floor(Date.now() / 1000)
    const body = await (await worker.fetch(new Request(`${BASE}/iclock/cdata?SN=A1`), e, ctx)).text()
    const lines = body.split('\n')
    expect(lines.map((l) => l.split('=')[0])).toEqual([
      'GET OPTION FROM: A1', 'Stamp', 'OpStamp', 'ATTLOGStamp', 'OPERLOGStamp', 'ATTPHOTOStamp', 'ErrorDelay',
      'Delay', 'TransTimes', 'TransInterval', 'TransFlag', 'Realtime', 'Encrypt',
    ])
    expect(lines).toContain('Stamp=9999')
    expect(lines).toContain('ErrorDelay=60')
    expect(lines).toContain('Delay=60')
    expect(lines).toContain('TransFlag=TransData AttLog')
    expect(lines).toContain('Encrypt=0')
    expect(Number(lines[2]!.split('=')[1])).toBeGreaterThanOrEqual(t0)
  })

  it('TRANS_FLAG overrides the TransFlag line', async () => {
    const { ctx } = makeCtx()
    const body = await (await worker.fetch(new Request(`${BASE}/iclock/push?SN=A1`), { ...env, TRANS_FLAG: '1111000000' }, ctx)).text()
    expect(body).toContain('TransFlag=1111000000')
  })

  it('parses the eSSL key=value line', async () => {
    const res = await call('/iclock/cdata?SN=S1&table=ATTLOG', {
      method: 'POST',
      body: 'PIN=1001\tDateTime=2025-09-02 14:32:11\tVerified=1\tStatus=0',
    })
    expect(await res.text()).toBe('OK: 1')
    expect(sent().punches[0]).toEqual({ pin: '1001', time: '2025-09-02 14:32:11', status: 0, verify: 1 })
  })

  it('converts epoch times with DEVICE_TZ_MINUTES', async () => {
    await call('/iclock/cdata?SN=S1&table=ATTLOG', { method: 'POST', body: '9\t1767225600\t0\t1' })
    expect(sent().punches[0].time).toBe('2026-01-01 05:30:00')
  })

  it('warns with field names only when nothing parses, and still replies OK: 0', async () => {
    const res = await call('/iclock/cdata?SN=S1&table=ATTLOG', {
      method: 'POST',
      body: 'Foo=1001\tBar=SECRETVALUE\n3\tcolumns\there',
    })
    expect(await res.text()).toBe('OK: 0')
    const w = vi.mocked(console.warn).mock.calls.map((c) => JSON.parse(String(c[0]))).find((j) => j.msg === 'no parsable lines')!
    expect(w.lines).toBe(2)
    expect(w.fields).toEqual(['Foo', 'Bar', 'cols=3'])
    expect(w.sn).toBe(createHash('sha256').update('S1').digest('hex').slice(0, 8))
    const raw = JSON.stringify(w)
    for (const leak of ['1001', 'SECRETVALUE', 'S1"']) expect(raw).not.toContain(leak)
  })

  it('does not warn for a blank body', async () => {
    await call('/iclock/cdata?SN=S1&table=ATTLOG', { method: 'POST', body: '\r\n\r\n' })
    expect(vi.mocked(console.warn)).not.toHaveBeenCalled()
  })

  it('capture log has the table and parameter names, never values', async () => {
    await call('/iclock/cdata?SN=SERIAL1&options=all&pushver=2.4.1&pushcommkey=TOPSECRETKEY&table=OPERLOG', { method: 'POST', body: 'x' })
    const j = vi.mocked(console.log).mock.calls.map((c) => JSON.parse(String(c[0]))).find((x) => x.msg === 'device request')!
    expect(j.table).toBe('OPERLOG')
    expect(j.params).toEqual(['SN', 'options', 'pushver', 'pushcommkey', 'table'])
    const raw = JSON.stringify(j)
    for (const leak of ['SERIAL1', 'TOPSECRETKEY', '2.4.1']) expect(raw).not.toContain(leak)
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
