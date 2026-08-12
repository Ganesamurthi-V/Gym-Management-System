import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { decideAdminAuth } from '@/lib/api/adminSecret'

/**
 * Authorization guard for the platform-admin API routes that operate with the
 * Supabase SERVICE ROLE key (RLS bypassed, cross-tenant reach).
 *
 * ─── Two accepted identities ────────────────────────────────────────────────
 *
 * 1. SESSION (browsers).  The signed-in Supabase user's email must equal
 *    ADMIN_EMAIL — the same gate `app/owner/admin/layout.tsx` already applies
 *    before rendering these pages. Authentication travels in the existing
 *    HttpOnly Supabase cookies, so the browser never holds or transmits
 *    ADMIN_PASSWORD. This replaces the previous
 *    `Authorization: Bearer ${prompt('Admin password')}` in
 *    `app/owner/admin/subscriptions/AdminSubscriptionList.tsx`, which put a
 *    long-lived shared secret into page memory and every request header.
 *
 * 2. BEARER (machine-to-machine).  `Authorization: Bearer <ADMIN_PASSWORD>`,
 *    retained because `gymflow-mobile` authenticates this way
 *    (`gymflow-mobile/lib/api/gyms.api.ts`). Removing it would break that
 *    client.
 *
 * Selection is explicit: if an Authorization header is present it MUST be a
 * valid bearer credential — we never fall back to the session path, so a stale
 * or wrong token produces a clear 401 instead of a confusing success.
 *
 * ─── Hardening ──────────────────────────────────────────────────────────────
 *   - Fails closed when ADMIN_PASSWORD / ADMIN_EMAIL are unset (503, not open).
 *   - Constant-time bearer comparison (see lib/api/adminSecret.ts).
 *   - Per-IP rate limit; fails closed if the limiter is unreachable.
 *   - Same-origin enforcement on cookie-authorised state-changing requests
 *     (CSRF): a cookie is ambient credentials, a bearer token is not.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/** 10 attempts / minute / IP across all admin service-role routes. */
const adminLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'ratelimit:admin_api',
})

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function deny(status: number, body: string, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { error: body },
    { status, headers: { 'Cache-Control': 'private, no-store', ...extraHeaders } }
  )
}

/**
 * Reject cross-site state-changing requests that rely on cookies.
 *
 * Supabase auth cookies are SameSite=Lax, which already blocks most cross-site
 * POSTs; this is defence in depth and makes the intent explicit. Only applied
 * to the cookie path — bearer callers are not browsers and have no ambient
 * credential to abuse.
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  // Non-browser clients often omit Origin entirely. Browsers always send it on
  // cross-origin requests, so an absent Origin on a same-site fetch is fine.
  if (!origin) return true
  try {
    return new URL(origin).host === req.nextUrl.host
  } catch {
    return false
  }
}

export type AdminAuthResult = { ok: true } | { ok: false; response: NextResponse }

/**
 * Authorize a platform-admin request.
 *
 * Usage:
 *   const auth = await requireAdmin(req, 'GET /api/gyms')
 *   if (!auth.ok) return auth.response
 */
export async function requireAdmin(
  req: NextRequest,
  routeLabel: string
): Promise<AdminAuthResult> {
  // ── Rate limit first, so brute-force attempts cost the attacker early ─────
  // FAIL CLOSED if the limiter is unreachable: these routes hold service-role
  // reach, so losing brute-force protection is not an acceptable availability
  // trade-off.
  let limit: { success: boolean; reset: number }
  try {
    limit = await adminLimiter.limit(clientIp(req))
  } catch (err) {
    logger.error('admin_auth_ratelimit_unavailable', {
      route: routeLabel,
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, response: deny(503, 'Service unavailable') }
  }

  if (!limit.success) {
    logger.warn('admin_auth_rate_limited', { route: routeLabel })
    return {
      ok: false,
      response: deny(429, 'Too many requests', {
        'Retry-After': String(Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000))),
      }),
    }
  }

  const authHeader = req.headers.get('authorization')

  // ── Path 1: machine-to-machine bearer credential ──────────────────────────
  if (authHeader) {
    const decision = decideAdminAuth(authHeader, process.env.ADMIN_PASSWORD)

    switch (decision.verdict) {
      case 'ok':
        return { ok: true }

      case 'misconfigured':
        // Operator error, not caller error. 503 keeps it distinguishable in
        // logs and never implies "try a different token".
        logger.error('admin_auth_misconfigured', { route: routeLabel, reason: decision.reason })
        return { ok: false, response: deny(503, 'Service unavailable') }

      case 'missing_token':
      case 'invalid_token':
        logger.warn('admin_auth_bearer_rejected', {
          route: routeLabel,
          verdict: decision.verdict,
        })
        return { ok: false, response: deny(401, 'Unauthorized') }
    }
  }

  // ── Path 2: signed-in super-admin session (browser) ───────────────────────
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (!adminEmail) {
    logger.error('admin_auth_misconfigured', {
      route: routeLabel,
      reason: 'ADMIN_EMAIL is not set',
    })
    return { ok: false, response: deny(503, 'Service unavailable') }
  }

  // CSRF: a cookie is sent automatically by the browser, so a state-changing
  // request must demonstrably originate from our own origin.
  if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    logger.warn('admin_auth_cross_origin_blocked', {
      route: routeLabel,
      method: req.method,
    })
    return { ok: false, response: deny(403, 'Forbidden') }
  }

  let email: string | undefined
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      logger.warn('admin_auth_no_session', { route: routeLabel })
      return { ok: false, response: deny(401, 'Unauthorized') }
    }
    email = data.user.email?.trim().toLowerCase()
  } catch (err) {
    logger.error('admin_auth_session_lookup_failed', {
      route: routeLabel,
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, response: deny(503, 'Service unavailable') }
  }

  if (!email || email !== adminEmail) {
    // Do not reveal whether a session existed or which email it held.
    logger.warn('admin_auth_not_super_admin', { route: routeLabel })
    return { ok: false, response: deny(403, 'Forbidden') }
  }

  return { ok: true }
}

/**
 * Controlled 500 for admin routes.
 *
 * The previous `catch (err) { return json({ error: err.message }) }` pattern
 * echoed raw Postgres/Supabase messages (and occasionally column names and
 * constraint identifiers) straight to the caller. Detail now goes to the
 * server log only.
 */
export function adminServerError(routeLabel: string, err: unknown): NextResponse {
  logger.error('admin_route_exception', {
    route: routeLabel,
    error: err instanceof Error ? err.message : String(err),
  })
  return deny(500, 'Internal server error')
}
