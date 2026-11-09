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
const MAX_PUNCHES_PER_REQUEST = 500
const HEARTBEAT_TTL_S = 60
const TIMEOUT_MS = 10_000

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
const empty = (status: number) => new Response(null, { status })

// Keys follow the ZKTeco PUSH SDK option names and vary by firmware; adjust per device if needed.
function configText(sn: string, env: Env): string {
  const d = Math.floor(Number(env.POLL_DELAY_SECONDS))
  const delay = d > 0 ? d : 30
  const t = env.DEVICE_TZ_MINUTES?.trim() ? Number(env.DEVICE_TZ_MINUTES) : 330
  const tz = Number.isInteger(t) && t >= -720 && t <= 840 ? t : 330
  return [
    `GET OPTION FROM: ${sn}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=None',
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

async function post(env: Env, serial: string, punches: Punch[]): Promise<void> {
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
  const json = (await res.json()) as { success?: boolean }
  // known=false (unregistered device) is still success: the device must drop those punches, not retry forever.
  if (json?.success !== true) throw new Error('app rejected request')
}

// Throws on any failure; callers then answer 503 so the device keeps its buffer.
async function forward(env: Env, serial: string, punches: Punch[]): Promise<void> {
  if (punches.length === 0) return post(env, serial, [])
  for (let i = 0; i < punches.length; i += MAX_PUNCHES_PER_REQUEST) {
    await post(env, serial, punches.slice(i, i + MAX_PUNCHES_PER_REQUEST))
  }
}

// Null = too large or bad gzip. The decompressed size is capped too, so a gzip bomb cannot exhaust memory.
async function readBody(req: Request): Promise<string | null> {
  if (!req.body) return ''
  const raw = new Uint8Array(await req.arrayBuffer())
  if (raw.length > MAX_BODY) return null
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

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

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

    if (path === '/iclock/push' || (path === '/iclock/cdata' && m === 'GET')) return text(configText(sn, env))
    // Push 3.x dialect, best effort and unverified against real firmware.
    if (path === '/iclock/registry') return text(`RegistryCode=${(await sha256Hex(sn)).slice(0, 20)}`)

    if (path === '/iclock/getrequest') {
      if (await heartbeatDue(sn)) {
        // Fire and forget: the device poll must not wait on the app.
        ctx.waitUntil(forward(env, sn, []).catch(() => console.warn(JSON.stringify({ msg: 'heartbeat failed', serial: sn }))))
      }
      return text('OK')
    }

    // POST /iclock/cdata
    if ((url.searchParams.get('table') ?? '').toUpperCase() !== 'ATTLOG') return text('OK')
    const body = await readBody(req)
    if (body === null) return empty(400)
    const { punches, skipped } = parseAttlog(body)
    if (punches.length > 0) {
      try {
        await forward(env, sn, punches)
      } catch (e) {
        // Reason is an HTTP status or an error name only, never a URL, header or body.
        console.warn(JSON.stringify({ msg: 'forward failed', serial: sn, count: punches.length, reason: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 120) : 'unknown' }))
        return text('ERROR', 503)
      }
    }
    console.log(JSON.stringify({ msg: 'attlog', serial: sn, accepted: punches.length, skipped }))
    return text(`OK:${punches.length}`)
  },
}
