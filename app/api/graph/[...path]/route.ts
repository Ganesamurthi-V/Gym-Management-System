/**
 * app/api/graph/[...path]/route.ts
 *
 * Transparent reverse proxy — Meta WhatsApp Graph API
 *
 * Incoming:  https://graph.gymflow.sbs/api/graph/{version}/{resource}
 * Forwards:  https://graph.facebook.com/{version}/{resource}
 *
 * The proxy is 100% transparent:
 *   - Method, headers, body, query params → forwarded exactly
 *   - Status code, response headers, body ← returned exactly
 *   - No caching, no token validation, no body inspection, no modification
 *
 * Example:
 *   POST https://graph.gymflow.sbs/api/graph/v23.0/1234567/messages
 *   → POST https://graph.facebook.com/v23.0/1234567/messages
 *
 * Upstream URL is read from GRAPH_API_BASE_URL env var.
 * Sensitive headers (Authorization, tokens) are NEVER logged.
 *
 * Supports: GET  POST  PUT  PATCH  DELETE  OPTIONS
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─── Upstream ─────────────────────────────────────────────────────────────────

function upstreamBase(): string {
  return (
    process.env.GRAPH_API_BASE_URL?.replace(/\/$/, '') ??
    'https://graph.facebook.com'
  )
}

// ─── Header filters ───────────────────────────────────────────────────────────

/**
 * Infrastructure / hop-by-hop headers that must NOT be forwarded to upstream.
 * These are injected by Vercel / Cloudflare and are meaningless or harmful
 * when sent to graph.facebook.com.
 */
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
])

/** Hop-by-hop headers from upstream response that must NOT be returned to clients. */
const STRIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
])

/** Fields that must never appear in log output. */
const NEVER_LOG_HEADERS = new Set([
  'authorization',
  'x-hub-signature',
  'x-hub-signature-256',
])

// ─── Core proxy ───────────────────────────────────────────────────────────────

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const upstream = upstreamBase()
  const pathStr  = path.join('/')
  const search   = req.nextUrl.search // already URL-encoded, pass through verbatim

  const targetUrl = `${upstream}/${pathStr}${search}`

  // ── Forward headers ───────────────────────────────────────────────────────
  const fwdHeaders = new Headers()
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (!STRIP_REQUEST_HEADERS.has(lower) && !NEVER_LOG_HEADERS.has(lower)) {
      fwdHeaders.set(key, value)
    } else if (!STRIP_REQUEST_HEADERS.has(lower)) {
      // Sensitive header — forward but never log
      fwdHeaders.set(key, value)
    }
  })
  // Override Host so SNI/vhost routing works correctly at graph.facebook.com
  fwdHeaders.set('host', new URL(upstream).hostname)

  // ── Body — stream directly, never buffer ─────────────────────────────────
  const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
  const body = BODY_METHODS.has(req.method) ? req.body : null

  const startMs = Date.now()

  // ── Structured request log (no sensitive data) ────────────────────────────
  logger.info('graph_proxy_request', {
    method: req.method,
    path:   `/${pathStr}`,
    query:  search || null,
  })

  // ── Forward ───────────────────────────────────────────────────────────────
  let upstream_res: Response
  try {
    upstream_res = await fetch(targetUrl, {
      method:   req.method,
      headers:  fwdHeaders,
      body,
      // @ts-expect-error — Node 18+ fetch accepts duplex for streaming request bodies
      duplex:   'half',
      redirect: 'manual', // pass 3xx through — do not follow
      signal:   AbortSignal.timeout(30_000),
    })
  } catch (err) {
    const latencyMs = Date.now() - startMs
    const message   = err instanceof Error ? err.message : String(err)

    logger.error('graph_proxy_upstream_error', { method: req.method, path: `/${pathStr}`, latencyMs, error: message })

    return NextResponse.json(
      { error: { message: 'Upstream request failed', type: 'ProxyError', code: 502 } },
      { status: 502 },
    )
  }

  const latencyMs = Date.now() - startMs

  // ── Structured response log ───────────────────────────────────────────────
  logger.info('graph_proxy_response', {
    method:    req.method,
    path:      `/${pathStr}`,
    status:    upstream_res.status,
    latencyMs,
  })

  // ── Response headers ──────────────────────────────────────────────────────
  const resHeaders = new Headers()
  upstream_res.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      resHeaders.set(key, value)
    }
  })
  resHeaders.set('access-control-allow-origin', '*')

  // ── Stream body back verbatim ─────────────────────────────────────────────
  return new NextResponse(upstream_res.body, {
    status:  upstream_res.status,
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
export async function OPTIONS(_req: NextRequest, _ctx: Ctx) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'access-control-allow-origin':  '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-max-age':       '86400',
    },
  })
}
