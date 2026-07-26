/**
 * app/api/graph/[...path]/route.ts
 *
 * Secure reverse proxy — Meta WhatsApp Graph API
 *
 * Incoming:  https://graph.gymflow.sbs/api/graph/{version}/{resource}
 * Forwards:  https://graph.facebook.com/{version}/{resource}
 *
 * Security:
 *   - Endpoint whitelist: only allowed Meta Graph endpoints pass through
 *   - Method whitelist: only GET, POST, PUT, PATCH, DELETE, OPTIONS
 *   - Request timeout: 30 seconds
 *   - Strips infrastructure headers (Vercel, Cloudflare)
 *   - Never logs Authorization headers or tokens
 *   - Never exposes stack traces or internal paths
 *   - Returns consistent JSON errors
 *   - Security headers on all responses
 *
 * Example:
 *   POST https://graph.gymflow.sbs/api/graph/v25.0/1234567/messages
 *   → POST https://graph.facebook.com/v25.0/1234567/messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import {
  isAllowedEndpoint,
  forbiddenResponse,
  errorResponse,
  SECURITY_HEADERS,
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
  resHeaders.set('Access-Control-Allow-Origin', '*')
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
export async function OPTIONS(_req: NextRequest, _ctx: Ctx) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Hub-Signature-256',
      'Access-Control-Max-Age': '86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
