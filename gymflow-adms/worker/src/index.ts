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
  // Value of the handshake TransFlag line. Older firmware may need the bit-string form (e.g. 1111000000) instead of
  // the word form; unverified on real hardware.
  TRANS_FLAG?: string
  // Opt-in handshake `TimeZone=<whole hours>` line (integer -12..14). Not sent by default: the only open-source server
  // that sends a TimeZone key uses whole hours, the hardware-tested one never sends it, and devices differ, so a wrong
  // value could shift a device clock. Unverified on real hardware. (DEVICE_TZ_MINUTES is separate: it only converts
  // epoch punch times.)
  DEVICE_TZ_HOURS?: string
}

const SN_RE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_BODY = 1024 * 1024
// Chunk size sent to the app (the app itself still accepts up to 500). Small chunks keep one request cheap.
const MAX_PUNCHES_PER_REQUEST = 100
// Hard cap on punches in one device request: a real device batch is far below this, so more means abuse.
const MAX_PUNCHES_TOTAL = 2000
// Serials the app reported as unregistered are answered from the cache for this long without calling the app, so
// random serials cannot turn every request into an app call. A newly registered serial therefore starts working
// within about 2 minutes (until its negative entry expires).
const UNKNOWN_TTL_S = 120
const TIMEOUT_MS = 10_000
const MAX_CMD_RESULTS = 50

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
const empty = (status: number) => new Response(null, { status })

function deviceTz(env: Env): number {
  const t = env.DEVICE_TZ_MINUTES?.trim() ? Number(env.DEVICE_TZ_MINUTES) : 330
  return Number.isInteger(t) && t >= -720 && t <= 840 ? t : 330
}

function tzLine(env: Env): string[] {
  const raw = env.DEVICE_TZ_HOURS?.trim()
  if (!raw || !/^-?\d+$/.test(raw)) return []
  const h = Number(raw)
  return h >= -12 && h <= 14 ? [`TimeZone=${h}`] : []
}

// Whole minutes the newest punch is ahead of the server's clock, both as naive IST-style wall clocks. Large positive
// means the device clock is ahead; large negative is normal for a resent backlog. Number only, so nothing sensitive logs.
function newestVsNowMin(punches: Punch[], env: Env): number | undefined {
  let newest = -Infinity
  for (const p of punches) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(p.time)
    if (!m) continue
    const t = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)
    if (t > newest) newest = t
  }
  if (!Number.isFinite(newest)) return undefined
  return Math.round((newest - (Date.now() + deviceTz(env) * 60000)) / 60000)
}

// Format follows open-source ADMS servers tested on real devices (saifulcoder/adms-server-ZKTeco on an X100-C,
// athwari/laravel-zkteco-adms-server). ZKTeco does not publish the spec, so acceptance per model is unverified.
function configText(sn: string, env: Env): string {
  const d = Math.floor(Number(env.POLL_DELAY_SECONDS))
  const delay = d > 0 ? d : 60
  return [
    `GET OPTION FROM: ${sn}`,
    'Stamp=9999',
    `OpStamp=${Math.floor(Date.now() / 1000)}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    // 9999 so devices never ask to upload attendance photos (bandwidth, and this Worker drops them anyway).
    'ATTPHOTOStamp=9999',
    'ErrorDelay=60',
    `Delay=${delay}`,
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    `TransFlag=${env.TRANS_FLAG?.trim() || 'TransData AttLog'}`,
    ...tzLine(env),
    'Realtime=1',
    'Encrypt=0',
  ].join('\n')
}

// Returns the app's `data`. Throws on a non-2xx, a timeout or success !== true.
async function appCall<T>(env: Env, url: string | URL, payload: unknown): Promise<T | undefined> {
  // redirect:'manual' so the bearer secret can never follow a redirect to another host; a 3xx then fails !res.ok
  // below. ('error' is not implemented by the Workers runtime and makes every fetch throw.)
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { Authorization: `Bearer ${env.ADMS_INGEST_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`app status ${res.status}`)
  const json = (await res.json()) as { success?: boolean; data?: T }
  if (json?.success !== true) throw new Error('app rejected request')
  return json.data
}

// Resolves to the app's `known` flag (false = serial not registered).
async function post(env: Env, serial: string, punches: Punch[]): Promise<boolean> {
  const data = await appCall<{ known?: boolean }>(env, env.APP_INGEST_URL, { serial, punches })
  // known=false (unregistered device) is still success: the device must drop those punches, not retry forever.
  return data?.known !== false
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

// The command relay endpoints live on the same origin as the ingest URL.
const appUrl = (env: Env, path: string) => new URL(path, env.APP_INGEST_URL)
// Error name or status only: never a URL, header or body.
const failReason = (e: unknown) => (e instanceof Error ? (e.message.startsWith('app ') ? e.message : e.name) : 'unknown')

// Pending server-to-device commands for this serial (the app returns complete wire lines, at most 5).
async function nextCommands(env: Env, sn: string): Promise<{ known: boolean; lines: string[] }> {
  const data = await appCall<{ known?: boolean; commands?: { line?: unknown }[] }>(
    env,
    appUrl(env, '/api/devices/commands/next'),
    { serial: sn },
  )
  // A line holding a newline would break the one-command-per-line framing, so only well-formed lines go out.
  const lines = (Array.isArray(data?.commands) ? data.commands : [])
    .map((c) => c?.line)
    .filter((l): l is string => typeof l === 'string' && /^C:\d+:[^\r\n]+$/.test(l))
    .slice(0, 5)
  return { known: data?.known !== false, lines }
}

// Device reports: records like `ID=12&Return=0&CMD=DATA UPDATE USERINFO ...`, one per line, or several joined by &.
function parseCmdResults(body: string): { id: number; ret: number }[] {
  const out: { id: number; ret: number }[] = []
  for (const line of body.split(/\r?\n/)) {
    for (const rec of line.split(/&(?=ID=)/i)) {
      const q = new URLSearchParams(rec.trim())
      const id = q.get('ID')
      const ret = q.get('Return')
      // Return can be negative (device error codes). Anything else is malformed and ignored.
      if (id === null || ret === null || !/^\d{1,9}$/.test(id) || !/^-?\d{1,9}$/.test(ret)) continue
      out.push({ id: Number(id), ret: Number(ret) })
      if (out.length >= MAX_CMD_RESULTS) return out
    }
  }
  return out
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

// Field names only (never values, PINs, times or the serial): enough to see which dialect a device speaks.
function fieldNames(body: string): { lines: number; fields: string[] } {
  const fields = new Set<string>()
  let lines = 0
  for (const l of body.split(/\r?\n/)) {
    if (!l.trim()) continue
    lines++
    if (l.length > 512) continue
    if (/^\s*\w+=/.test(l)) for (const k of l.matchAll(/(?:^|\s)(\w{1,32})=/g)) fields.add(k[1]!)
    else fields.add(`cols=${l.split('\t').length}`)
  }
  return { lines, fields: [...fields].slice(0, 20) }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    // Devices on some firmware call /iclock/cdata.aspx; treat it as the same route.
    const path = url.pathname.replace(/\.aspx$/i, '')
    const m = req.method

    if (path === '/healthz' && m === 'GET') return empty(200)
    if (path === '/iclock/ping' && m === 'GET') return text('OK')
    // Bulk table uploads by file: acknowledged without reading the body.
    if (path === '/iclock/fdata' && m === 'POST') return text('OK')

    const routes: Record<string, string[]> = {
      '/iclock/cdata': ['GET', 'POST'],
      '/iclock/getrequest': ['GET'],
      '/iclock/devicecmd': ['POST'],
      '/iclock/registry': ['POST'],
      '/iclock/push': ['GET', 'POST'],
    }
    if (!routes[path]?.includes(m)) return empty(404)

    const sn = url.searchParams.get('SN')
    if (!sn || !SN_RE.test(sn)) return text('OK')

    // Capture log for the first real device: the parameter NAMES it sends (never values) show whether it uses
    // pushcommkey, CommKey, pushver, c, Stamp or options. The table value is clamped because the client controls it.
    if (path === '/iclock/cdata' || path === '/iclock/getrequest') {
      console.log(
        JSON.stringify({
          msg: 'device request',
          sn: await serialTag(sn),
          path,
          method: m,
          table: (url.searchParams.get('table') ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20),
          params: [...new Set(url.searchParams.keys())].slice(0, 20).map((k) => k.slice(0, 32)),
        }),
      )
    }

    // Known-unregistered serial: answer without touching the app. GET/push still get the config so the device keeps
    // working; ATTLOG POST gets a plain OK (nothing stored); getrequest and devicecmd get OK.
    const unknown = await isUnknown(sn)
    if (unknown && m === 'POST' && path === '/iclock/cdata') return text('OK')
    if (unknown && (path === '/iclock/getrequest' || path === '/iclock/devicecmd')) return text('OK')

    if (path === '/iclock/push' || (path === '/iclock/cdata' && m === 'GET')) return text(configText(sn, env))
    // Push 3.x dialect, best effort and unverified against real firmware.
    if (path === '/iclock/registry') return text(`RegistryCode=${(await sha256Hex(sn)).slice(0, 20)}`)

    if (path === '/iclock/getrequest') {
      // Every poll asks the app for pending commands; that call doubles as the device heartbeat. Never 5xx to a
      // polling device: on any app failure answer plain OK and the next poll retries.
      try {
        const { known, lines } = await nextCommands(env, sn)
        if (!known) {
          ctx.waitUntil(markUnknown(sn))
          return text('OK')
        }
        return text(lines.length ? lines.join('\n') : 'OK')
      } catch (e) {
        console.warn(JSON.stringify({ msg: 'commands/next failed', sn: await serialTag(sn), reason: failReason(e) }))
        return text('OK')
      }
    }

    if (path === '/iclock/devicecmd') {
      const declared = Number(req.headers.get('content-length'))
      const body = Number.isFinite(declared) && declared > MAX_BODY ? null : await readBody(req)
      const results = body ? parseCmdResults(body) : []
      if (results.length) {
        // Fire and forget: the device is answered at once, and a failed ack only leaves the command to be re-sent.
        ctx.waitUntil(
          appCall(env, appUrl(env, '/api/devices/commands/ack'), { serial: sn, results }).then(
            () => {},
            async (e) =>
              console.warn(JSON.stringify({ msg: 'commands/ack failed', sn: await serialTag(sn), reason: failReason(e) })),
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
    const { punches, skipped } = parseAttlog(body, { epochOffsetMinutes: deviceTz(env) })
    if (punches.length > MAX_PUNCHES_TOTAL) return empty(400)
    if (punches.length > 0) {
      try {
        if (!(await forward(env, sn, punches))) ctx.waitUntil(markUnknown(sn))
      } catch (e) {
        // Reason is an HTTP status or an error name only, never a URL, header or body.
        console.warn(JSON.stringify({ msg: 'forward failed', sn: await serialTag(sn), count: punches.length, reason: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 120) : 'unknown' }))
        return text('ERROR', 503)
      }
    } else if (body.trim()) {
      // A new dialect would otherwise be lost silently; the reply stays OK so the device does not retry forever.
      console.warn(JSON.stringify({ msg: 'no parsable lines', sn: await serialTag(sn), ...fieldNames(body) }))
    }
    console.log(JSON.stringify({ msg: 'attlog', sn: await serialTag(sn), accepted: punches.length, skipped, ...(punches.length > 0 ? { newest_vs_now_min: newestVsNowMin(punches, env) } : {}) }))
    return text(`OK: ${punches.length}`)
  },
}
