/**
 * Transparent Reverse Proxy — Meta WhatsApp Graph API
 *
 * Route:  /api/graph/[...path]
 * Domain: https://graph.gymflow.sbs/api/graph
 *
 * Every request arriving here is forwarded verbatim to:
 *   https://graph.facebook.com/{path}?{query}
 *
 * The proxy is fully transparent:
 *   - Method, headers, body, query params → preserved exactly
 *   - Status code, response headers, response body ← preserved exactly
 *   - No token validation, no body inspection, no caching, no modification
 *
 * Example:
 *   POST https://graph.gymflow.sbs/api/graph/v23.0/123456/messages
 *   →  POST https://graph.facebook.com/v23.0/123456/messages
 *
 * Logging: method + endpoint + status + latency only.
 * Sensitive data (tokens, bodies, phone numbers) is never logged.
 *
 * Config:
 *   GRAPH_API_BASE_URL  — upstream base (default: https://graph.facebook.com)
 */

import { NextRequest, NextResponse } from 'next/server'

// ─── Upstream base URL ────────────────────────────────────────────────────────

function getUpstreamBase(): string {
  return (
    process.env.GRAPH_API_BASE_URL?.replace(/\/$/, '') ??
    'https://graph.facebook.com'
  )
}

// ─── Headers to strip from the incoming request ───────────────────────────────
// These are Next.js / Vercel infrastructure headers that must not be forwarded.

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

// ─── Headers to strip from the upstream response ─────────────────────────────
// Hop-by-hop headers that must not be returned to the client.

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

// ─── Core proxy handler ───────────────────────────────────────────────────────

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const upstreamBase = getUpstreamBase()
  const upstreamPath = path.join('/')
  const search       = req.nextUrl.search ?? '' // preserve query string exactly

  const upstreamUrl = `${upstreamBase}/${upstreamPath}${search}`

  // ── Build forwarded headers ────────────────────────────────────────────────
  const forwardedHeaders = new Headers()
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardedHeaders.set(key, value)
    }
  })
  // Set Host to match upstream so TLS SNI and vhost routing work correctly
  forwardedHeaders.set('host', new URL(upstreamBase).hostname)

  // ── Determine whether to include a body ───────────────────────────────────
  // GET, HEAD, OPTIONS, DELETE typically have no body
  const HAS_BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
  const body = HAS_BODY_METHODS.has(req.method)
    ? req.body   // ReadableStream — streamed through, not buffered
    : undefined

  const startMs = Date.now()

  // ── Structured log (no sensitive data) ────────────────────────────────────
  console.log(
    JSON.stringify({
      ts:      new Date().toISOString(),
      type:    'graph_proxy_request',
      method:  req.method,
      path:    `/${upstreamPath}`,
      query:   search || null,
    })
  )

  // ── Forward request ────────────────────────────────────────────────────────
  let upstreamRes: Response

  try {
    upstreamRes = await fetch(upstreamUrl, {
      method:  req.method,
      headers: forwardedHeaders,
      body,
      // @ts-expect-error — Node 18+ fetch supports duplex for streaming bodies
      duplex:  'half',
      signal:  AbortSignal.timeout(30_000), // 30 s max
      // Never follow redirects automatically — pass them through to the client
      redirect: 'manual',
    })
  } catch (err) {
    const latencyMs = Date.now() - startMs
    const message   = err instanceof Error ? err.message : String(err)

    console.error(
      JSON.stringify({
        ts:        new Date().toISOString(),
        type:      'graph_proxy_error',
        method:    req.method,
        path:      `/${upstreamPath}`,
        error:     message,
        latencyMs,
      })
    )

    return NextResponse.json(
      {
        error: {
          message: 'Upstream request failed',
          type:    'ProxyError',
          code:    502,
        },
      },
      { status: 502 }
    )
  }

  const latencyMs = Date.now() - startMs

  // ── Log response ────────────────────────────────────────────────────────────
  console.log(
    JSON.stringify({
      ts:        new Date().toISOString(),
      type:      'graph_proxy_response',
      method:    req.method,
      path:      `/${upstreamPath}`,
      status:    upstreamRes.status,
      latencyMs,
    })
  )

  // ── Build response headers ─────────────────────────────────────────────────
  const responseHeaders = new Headers()
  upstreamRes.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value)
    }
  })
  // Allow cross-origin access (needed when called from browser-side code)
  responseHeaders.set('access-control-allow-origin', '*')

  // ── Stream response body back ──────────────────────────────────────────────
  return new NextResponse(upstreamRes.body, {
    status:  upstreamRes.status,
    headers: responseHeaders,
  })
}

// ─── Route exports ────────────────────────────────────────────────────────────
// One export per HTTP method — Next.js App Router requirement.
// All delegate to the same proxy() function.

export const dynamic = 'force-dynamic' // never cache
export const runtime = 'nodejs'        // required for streaming body

type RouteContext = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function OPTIONS(req: NextRequest, ctx: RouteContext) {
  // Return CORS preflight without hitting upstream
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
