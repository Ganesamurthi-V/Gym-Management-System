/**
 * app/api/graph/[...path]/route.ts
 *
 * Secure reverse proxy — Meta WhatsApp Graph API
 *
 * Incoming:  https://graph.gymflow.sbs/api/graph/{version}/{resource}
 * Forwards:  https://graph.facebook.com/{version}/{resource}
 *
 * Security:
 *   - Server-to-server only: browser-originated requests are rejected, and no
 *     CORS access is granted (no wildcard ACAO, no preflight approval)
 *   - Optional shared secret (GRAPH_PROXY_SECRET) when configured
 *   - Endpoint whitelist: only allowed Meta Graph endpoints pass through
 *   - Method whitelist: only GET, POST, PUT, PATCH, DELETE, OPTIONS
 *   - Per-IP rate limit (120/min) applied in middleware.ts
 *   - Request timeout: 30 seconds
 *   - Strips infrastructure headers (Vercel, Cloudflare) and our proxy secret
 *   - Never logs Authorization headers or tokens
 *   - Never exposes stack traces or internal paths
 *   - Returns consistent JSON errors
 *   - Security headers on all responses
 *
 * This route holds NO Meta credential of its own — it forwards the caller's
 * Authorization header. The WhatsApp access token lives only in server env and
 * is attached by services/whatsapp/graph.ts.
 *
 * Example:
 *   POST https://graph.gymflow.sbs/api/graph/v25.0/1234567/messages
 *   → POST https://graph.facebook.com/v25.0/1234567/messages
 */

import { NextRequest } from 'next/server'
import { timingSafeEqual, createHash } from 'node:crypto'
import { logger } from '@/lib/logger'
import {
  isAllowedEndpoint,
  forbiddenResponse,
  errorResponse,
  GRAPH_PROXY_SECRET_HEADER,
  getGraphProxySecret,
} from '@/lib/graph-domain'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─── Config ───────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000

function upstreamBase(): string {
  return (
    process.env.GRAPH_API_BASE_URL?.replace(/\/$/, '') ??
    'https://graph.facebook.com'
  )
}

// ─── Caller authorisation ─────────────────────────────────────────────────────

/**
 * Is this request coming from a web page (as opposed to our server)?
 *
 * Browsers always attach `Origin` on cross-origin requests and set
 * `Sec-Fetch-Mode: cors`. Server-side `fetch` (our WhatsApp service) sends
 * neither. No browser has any legitimate reason to reach this proxy, so the
 * presence of either marker is treated as abuse.
 *
 * Previously the route advertised `Access-Control-Allow-Origin: *` together with
 * `Access-Control-Allow-Headers: Authorization`, which actively invited any page
 * on the internet to relay credentialed calls to Meta through our domain.
 */
function isBrowserOriginated(req: NextRequest): boolean {
  if (req.headers.get('origin')) return true
  const fetchMode = req.headers.get('sec-fetch-mode')
  if (fetchMode && fetchMode !== 'navigate') return true
  return false
}

/** Constant-time compare via fixed-width digests (no length leak, no throw). */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

// ─── Header filters ───────────────────────────────────────────────────────────

/** Infrastructure headers that must NOT be forwarded to upstream. */
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-vercel-id',
  'x-vercel-deployment-url',
  'x-vercel-forwarded-for',
  'x-vercel-proxied-for',
  'x-vercel-sc-headers',
  'x-middleware-subrequest',
  'x-middleware-preflight',
  'cdn-loop',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'connection',
  'transfer-encoding',
  'te',
  'cookie',
  // Our own proxy credential — must never be forwarded to Meta.
  'x-graph-proxy-secret',
])

/** Hop-by-hop headers from upstream response that must NOT be returned. */
const STRIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'server',
  'x-powered-by',
])

// ─── Core proxy ───────────────────────────────────────────────────────────────

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const pathStr = path.join('/')

  // ── Reject browser-originated calls ───────────────────────────────────────
  // This proxy exists purely for server-to-server WhatsApp traffic. Anything
  // arriving from a web page is either a misconfiguration or an attempt to use
  // us as a credential-forwarding relay.
  if (isBrowserOriginated(req)) {
    logger.warn('graph_proxy_blocked', {
      method: req.method,
      path: `/${pathStr}`,
      reason: 'browser_originated',
    })
    return forbiddenResponse('This endpoint is not callable from a browser.')
  }

  // ── Optional shared-secret gate ───────────────────────────────────────────
  // Opt-in: enforced only when GRAPH_PROXY_SECRET is configured, so turning it
  // on cannot break live sending. See lib/graph-domain.ts for the rationale.
  const proxySecret = getGraphProxySecret()
  if (proxySecret) {
    const provided = req.headers.get(GRAPH_PROXY_SECRET_HEADER)
    if (!provided || !secretMatches(provided, proxySecret)) {
      logger.warn('graph_proxy_blocked', {
        method: req.method,
        path: `/${pathStr}`,
        reason: 'proxy_secret_invalid',
      })
      return forbiddenResponse('Invalid proxy credentials.')
    }
  }

  // ── Path traversal protection ─────────────────────────────────────────────
  // Reject any path containing ".." or encoded traversal sequences to prevent
  // bypassing the endpoint whitelist via URL normalization.
  if (pathStr.includes('..') || pathStr.includes('%2e') || pathStr.includes('%2E')) {
    logger.warn('graph_proxy_blocked', { method: req.method, path: `/${pathStr}`, reason: 'path_traversal' })
    return forbiddenResponse('Invalid path.')
  }

  // ── Endpoint whitelist ────────────────────────────────────────────────────
  // Only allow requests to Meta Graph endpoints we actually use.
  // Version-only paths (e.g. "v25.0/123456789") without an endpoint are allowed
  // for phone_number metadata lookups (GET /{version}/{phone_number_id}).
  const needsEndpointCheck = path.length > 2 // version + phone_id + endpoint
  if (needsEndpointCheck && !isAllowedEndpoint(pathStr)) {
    logger.warn('graph_proxy_blocked', { method: req.method, path: `/${pathStr}`, reason: 'endpoint_not_allowed' })
    return forbiddenResponse()
  }

  const upstream = upstreamBase()
  const search = req.nextUrl.search
  const targetUrl = `${upstream}/${pathStr}${search}`

  // ── Forward headers (strip infra + cookies, preserve Auth) ────────────────
  const fwdHeaders = new Headers()
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      fwdHeaders.set(key, value)
    }
  })
  fwdHeaders.set('host', new URL(upstream).hostname)

  // ── Body ──────────────────────────────────────────────────────────────────
  const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
  const body = BODY_METHODS.has(req.method) ? req.body : null

  const startMs = Date.now()
  const requestId = crypto.randomUUID().slice(0, 8)

  logger.info('graph_proxy_request', {
    requestId,
    method: req.method,
    path: `/${pathStr}`,
  })

  // ── Forward to Meta ───────────────────────────────────────────────────────
  let upstreamRes: Response
  try {
    upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: fwdHeaders,
      body,
      // @ts-expect-error — Node 18+ fetch accepts duplex for streaming bodies
      duplex: 'half',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const latencyMs = Date.now() - startMs
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    const message = isTimeout ? 'Upstream request timed out' : 'Upstream request failed'
    const status = isTimeout ? 504 : 502

    logger.error('graph_proxy_upstream_error', {
      requestId,
      method: req.method,
      path: `/${pathStr}`,
      latencyMs,
      error: message,
    })

    return errorResponse(message, status)
  }

  const latencyMs = Date.now() - startMs

  logger.info('graph_proxy_response', {
    requestId,
    method: req.method,
    path: `/${pathStr}`,
    status: upstreamRes.status,
    latencyMs,
  })

  // ── Build response with security headers ──────────────────────────────────
  const resHeaders = new Headers()
  upstreamRes.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      resHeaders.set(key, value)
    }
  })
  // Security headers
  resHeaders.set('X-Content-Type-Options', 'nosniff')
  resHeaders.set('Cache-Control', 'no-store')
  resHeaders.set('X-Request-Id', requestId)
  // NOTE: `Access-Control-Allow-Origin: *` was deliberately REMOVED. CORS is a
  // browser-only mechanism and this proxy is server-to-server, so the wildcard
  // granted nothing legitimate while telling every origin on the internet that
  // it could send credentialed requests through us.
  resHeaders.delete('access-control-allow-origin')
  // Strip any server identity
  resHeaders.delete('x-powered-by')
  resHeaders.delete('server')

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  })
}

// ─── Route handlers ───────────────────────────────────────────────────────────

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path)
}
export async function POST(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path)
}
export async function PUT(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path)
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path)
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path)
}
/**
 * CORS preflight is intentionally NOT granted.
 *
 * This handler previously replied with `Access-Control-Allow-Origin: *` plus
 * `Access-Control-Allow-Headers: Authorization`, which is precisely the
 * combination that lets an arbitrary web page relay credentialed requests to
 * Meta through our domain. The proxy only ever serves server-to-server traffic,
 * where CORS does not apply, so refusing the preflight costs nothing and closes
 * the browser attack surface completely.
 */
export async function OPTIONS(_req: NextRequest, _ctx: Ctx) {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  })
}
