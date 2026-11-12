import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type { Config } from './config.js'
import { createForwarder, type Forwarder } from './forward.js'
import { parseAttlog } from './parser.js'
import { RateLimiter } from './rateLimit.js'

const SN_RE = /^[A-Za-z0-9_-]{1,64}$/
const HEARTBEAT_INTERVAL_MS = 60_000

export interface AppDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  rateLimit?: { capacity: number; refillPerSec: number }
  now?: () => number
}

// Keys follow the ZKTeco PUSH SDK option names and vary by firmware; adjust per device if needed.
function configText(sn: string, tzMinutes: number): string {
  return [
    `GET OPTION FROM: ${sn}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog',
    `TimeZone=${tzMinutes}`,
    'Realtime=1',
    'Encrypt=None',
  ].join('\n')
}

export function buildApp(config: Config, deps: AppDeps = {}): FastifyInstance {
  const now = deps.now ?? Date.now
  const forward: Forwarder = createForwarder({
    url: config.ingestUrl,
    secret: config.ingestSecret,
    fetchImpl: deps.fetchImpl ?? fetch,
    timeoutMs: deps.timeoutMs ?? 10_000,
  })
  const limiter = new RateLimiter(deps.rateLimit?.capacity, deps.rateLimit?.refillPerSec, now)
  const lastHeartbeat = new Map<string, number>()

  const app = Fastify({
    logger: { level: config.logLevel },
    disableRequestLogging: true, // default request logs would include full URLs
    bodyLimit: 1024 * 1024,
    trustProxy: true, // behind Caddy: use the forwarded client IP for rate limiting
    // Devices on some firmware call /iclock/cdata.aspx; treat it as the same route.
    rewriteUrl: (req) => (req.url ?? '/').replace(/^([^?]*?)\.aspx(?=\?|$)/i, '$1'),
  })

  // Devices send any or no content-type, sometimes gzip. Take the raw buffer for all of them.
  app.removeAllContentTypeParsers()
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
    if (String(req.headers['content-encoding'] ?? '').toLowerCase() !== 'gzip') return done(null, body)
    try {
      done(null, gunzipSync(body as Buffer, { maxOutputLength: 4 * 1024 * 1024 }))
    } catch {
      done(Object.assign(new Error('bad gzip'), { statusCode: 400 }))
    }
  })

  app.addHook('onRequest', async (req, reply) => {
    if (!limiter.allow(req.ip)) return reply.code(429).send()
  })

  app.setNotFoundHandler((_req, reply) => reply.code(404).send())
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500
    req.log.warn({ status }, 'request error')
    return reply.code(status).send()
  })

  const text = (reply: FastifyReply, body: string, code = 200) =>
    reply.code(code).type('text/plain; charset=utf-8').send(body)

  // Returns the validated serial, or replies OK (device is ignored) and returns null.
  const serialOf = (req: FastifyRequest, reply: FastifyReply): string | null => {
    const sn = (req.query as Record<string, unknown>)?.SN
    if (typeof sn === 'string' && SN_RE.test(sn)) return sn
    text(reply, 'OK')
    return null
  }

  const bodyText = (req: FastifyRequest) => (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '')

  app.get('/iclock/cdata', async (req, reply) => {
    const sn = serialOf(req, reply)
    if (!sn) return reply
    return text(reply, configText(sn, config.tzMinutes))
  })

  app.post('/iclock/cdata', async (req, reply) => {
    const sn = serialOf(req, reply)
    if (!sn) return reply
    const table = String((req.query as Record<string, unknown>).table ?? '').toUpperCase()
    if (table !== 'ATTLOG') return text(reply, 'OK')
    const { punches, skipped } = parseAttlog(bodyText(req))
    if (punches.length > 0) {
      try {
        const { known } = await forward(sn, punches)
        req.log.info({ serial: sn, accepted: punches.length, skipped, known }, 'attlog forwarded')
      } catch {
        req.log.warn({ serial: sn, count: punches.length, status: 503 }, 'forward failed')
        return text(reply, 'ERROR', 503)
      }
    } else {
      req.log.info({ serial: sn, accepted: 0, skipped }, 'attlog empty')
    }
    return text(reply, `OK:${punches.length}`)
  })

  app.get('/iclock/getrequest', async (req, reply) => {
    const sn = serialOf(req, reply)
    if (!sn) return reply
    const t = now()
    const last = lastHeartbeat.get(sn)
    if (last === undefined || t - last >= HEARTBEAT_INTERVAL_MS) {
      if (lastHeartbeat.size > 10_000) {
        for (const [k, v] of lastHeartbeat) if (t - v >= HEARTBEAT_INTERVAL_MS) lastHeartbeat.delete(k)
      }
      lastHeartbeat.set(sn, t)
      // Fire and forget: the device poll must not wait on the app. Failure re-arms the throttle.
      forward(sn, []).catch(() => {
        lastHeartbeat.delete(sn)
        req.log.warn({ serial: sn }, 'heartbeat failed')
      })
    }
    return text(reply, 'OK')
  })

  app.post('/iclock/devicecmd', async (_req, reply) => text(reply, 'OK'))
  app.get('/iclock/ping', async (_req, reply) => text(reply, 'OK'))

  // Push 3.x dialect, best effort and unverified against real firmware.
  app.post('/iclock/registry', async (req, reply) => {
    const sn = serialOf(req, reply)
    if (!sn) return reply
    return text(reply, `RegistryCode=${createHash('sha256').update(sn).digest('hex').slice(0, 20)}`)
  })
  const push = async (req: FastifyRequest, reply: FastifyReply) => {
    const sn = serialOf(req, reply)
    if (!sn) return reply
    return text(reply, configText(sn, config.tzMinutes))
  }
  app.get('/iclock/push', push)
  app.post('/iclock/push', push)

  app.get('/healthz', async (_req, reply) => reply.code(200).send())

  return app
}
