// ADMS push receiver as a Worker. Port of ../../src/app.ts (the Fastify app is the spec). The parser is shared
// with it, so there is one definition of the punch formats.
// No per-IP rate limiting here: the app already rate-limits per device serial, and device traffic arrives from
// many NATed gym IPs, so an IP limit would only hurt real devices.
import { parseAttlog, type Punch } from '../../src/parser.ts'

export interface Env {
  ADMS_INGEST_SECRET: string
  APP_INGEST_URL: string
  POLL_DELAY_SECONDS?: string
  DEVICE_TZ_MINUTES?: string
}

const SN_RE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_BODY = 1024 * 1024
// Chunk size sent to the app (the app itself still accepts up to 500). Small chunks keep one request cheap.
const MAX_PUNCHES_PER_REQUEST = 100
// Hard cap on punches in one device request: a real device batch is far below this, so more means abuse.
const MAX_PUNCHES_TOTAL = 2000
const HEARTBEAT_TTL_S = 60
// Serials the app reported as unregistered are answered from the cache for this long without calling the app, so
// random serials cannot turn every request into an app call. A newly registered serial therefore starts working
// within about 2 minutes (until its negative entry expires).
const UNKNOWN_TTL_S = 120
const TIMEOUT_MS = 10_000

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
const empty = (status: number) => new Response(null, { status })

// Keys follow the ZKTeco PUSH SDK option names and vary by firmware; adjust per device if needed.
function configText(sn: string, env: Env): string {
  const d = Math.floor(Number(env.POLL_DELAY_SECONDS))
  const delay = d > 0 ? d : 60
  const t = env.DEVICE_TZ_MINUTES?.trim() ? Number(env.DEVICE_TZ_MINUTES) : 330
  const tz = Number.isInteger(t) && t >= -720 && t <= 840 ? t : 330
  return [
    `GET OPTION FROM: ${sn}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    // 9999 so devices never ask to upload attendance photos (bandwidth, and this Worker drops them anyway).
    'ATTPHOTOStamp=9999',
    'ErrorDelay=30',
    `Delay=${delay}`,
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog',
    `TimeZone=${tz}`,
    'Realtime=1',
    'Encrypt=None',
  ].join('\n')
}

// Resolves to the app's `known` flag (false = serial not registered).
async function post(env: Env, serial: string, punches: Punch[]): Promise<boolean> {
  // redirect:'manual' so the bearer secret can never follow a redirect to another host; a 3xx then fails !res.ok
  // below. ('error' is not implemented by the Workers runtime and makes every fetch throw.)
  const res = await fetch(env.APP_INGEST_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: { Authorization: `Bearer ${env.ADMS_INGEST_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ serial, punches }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`app status ${res.status}`)
  const json = (await res.json()) as { success?: boolean; data?: { known?: boolean } }
  // known=false (unregistered device) is still success: the device must drop those punches, not retry forever.
  if (json?.success !== true) throw new Error('app rejected request')
  return json.data?.known !== false
}

// Throws on any failure; callers then answer 503 so the device keeps its buffer. Resolves to false when unknown.
async function forward(env: Env, serial: string, punches: Punch[]): Promise<boolean> {
  if (punches.length === 0) return post(env, serial, [])
  let known = true
  for (let i = 0; i < punches.length; i += MAX_PUNCHES_PER_REQUEST) {
    if (!(await post(env, serial, punches.slice(i, i + MAX_PUNCHES_PER_REQUEST)))) known = false
  }
  return known
}

// Null = too large or bad gzip. The decompressed size is capped too, so a gzip bomb cannot exhaust memory.
async function readBody(req: Request): Promise<string | null> {
  if (!req.body) return ''
  // Stream with a running count instead of arrayBuffer(): a missing or lying Content-Length cannot make us buffer more.
  const rd = req.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await rd.read()
    if (done) break
    total += value.length
    if (total > MAX_BODY) {
      await rd.cancel().catch(() => {})
      return null
    }
    parts.push(value)
  }
  const raw = new Uint8Array(total)
  let off = 0
  for (const part of parts) {
    raw.set(part, off)
    off += part.length
  }
  const gz = req.headers.get('content-encoding')?.toLowerCase() === 'gzip' || (raw[0] === 0x1f && raw[1] === 0x8b)
  if (!gz) return new TextDecoder().decode(raw)
  try {
    const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 4 * MAX_BODY) return null
      chunks.push(value)
    }
    return new TextDecoder().decode(await new Blob(chunks).arrayBuffer())
  } catch {
    return null
  }
}

// Workers isolates share no memory, so the once-per-minute throttle lives in the Cache API.
async function heartbeatDue(sn: string): Promise<boolean> {
  try {
    const key = new Request(`https://heartbeat.invalid/${sn}`)
    if (await caches.default.match(key)) return false
    await caches.default.put(key, new Response('1', { headers: { 'cache-control': `max-age=${HEARTBEAT_TTL_S}` } }))
  } catch {
    // Cache unavailable: sending the heartbeat is harmless, skipping it would show the device as offline.
  }
  return true
}

async function isUnknown(sn: string): Promise<boolean> {
  try {
    return !!(await caches.default.match(new Request(`https://unknown.invalid/${sn}`)))
  } catch {
    return false // Cache unavailable: fall through to the app, which is the authority.
  }
}

async function markUnknown(sn: string): Promise<void> {
  try {
    await caches.default.put(
      new Request(`https://unknown.invalid/${sn}`),
      new Response('1', { headers: { 'cache-control': `max-age=${UNKNOWN_TTL_S}` } }),
    )
  } catch {
    // Without the cache the only cost is another app call next time.
  }
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Logs carry this short one-way tag instead of the serial, so a log reader cannot learn which devices exist.
const serialTag = async (sn: string) => (await sha256Hex(sn)).slice(0, 8)

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    // Devices on some firmware call /iclock/cdata.aspx; treat it as the same route.
    const path = url.pathname.replace(/\.aspx$/i, '')
    const m = req.method

    if (path === '/healthz' && m === 'GET') return empty(200)
    if (path === '/iclock/ping' && m === 'GET') return text('OK')
    if (path === '/iclock/devicecmd' && m === 'POST') return text('OK')

    const routes: Record<string, string[]> = {
      '/iclock/cdata': ['GET', 'POST'],
      '/iclock/getrequest': ['GET'],
      '/iclock/registry': ['POST'],
      '/iclock/push': ['GET', 'POST'],
    }
    if (!routes[path]?.includes(m)) return empty(404)

    const sn = url.searchParams.get('SN')
    if (!sn || !SN_RE.test(sn)) return text('OK')

    // Known-unregistered serial: answer without touching the app. GET/push still get the config so the device keeps
    // working; ATTLOG POST gets a plain OK (nothing stored); getrequest gets OK.
    const unknown = await isUnknown(sn)
    if (unknown && m === 'POST' && path === '/iclock/cdata') return text('OK')
    if (unknown && path === '/iclock/getrequest') return text('OK')

    if (path === '/iclock/push' || (path === '/iclock/cdata' && m === 'GET')) return text(configText(sn, env))
    // Push 3.x dialect, best effort and unverified against real firmware.
    if (path === '/iclock/registry') return text(`RegistryCode=${(await sha256Hex(sn)).slice(0, 20)}`)

    if (path === '/iclock/getrequest') {
      if (await heartbeatDue(sn)) {
        // Fire and forget: the device poll must not wait on the app.
        ctx.waitUntil(
          forward(env, sn, []).then(
            async (known) => {
              if (!known) await markUnknown(sn)
            },
            async () => console.warn(JSON.stringify({ msg: 'heartbeat failed', sn: await serialTag(sn) })),
          ),
        )
      }
      return text('OK')
    }

    // POST /iclock/cdata
    if ((url.searchParams.get('table') ?? '').toUpperCase() !== 'ATTLOG') return text('OK')
    // Reject before reading anything when the declared size is already too big.
    const declared = Number(req.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_BODY) return empty(413)
    const body = await readBody(req)
    if (body === null) return empty(400)
    const { punches, skipped } = parseAttlog(body)
    if (punches.length > MAX_PUNCHES_TOTAL) return empty(400)
    if (punches.length > 0) {
      try {
        if (!(await forward(env, sn, punches))) ctx.waitUntil(markUnknown(sn))
      } catch (e) {
        // Reason is an HTTP status or an error name only, never a URL, header or body.
        console.warn(JSON.stringify({ msg: 'forward failed', sn: await serialTag(sn), count: punches.length, reason: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 120) : 'unknown' }))
        return text('ERROR', 503)
      }
    }
    console.log(JSON.stringify({ msg: 'attlog', sn: await serialTag(sn), accepted: punches.length, skipped }))
    return text(`OK:${punches.length}`)
  },
}
