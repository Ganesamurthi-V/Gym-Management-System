import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGymForUser } from '@/lib/supabase/queries'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuthContext = {
  user: { id: string; email?: string }
  gym: { id: string; name: string }
  supabase: SupabaseClient
  log: ReturnType<typeof apiLogger>
}

type HandlerFn = (
  req: NextRequest,
  ctx: AuthContext
) => Promise<NextResponse>

/**
 * Methods that are "safe" per RFC 9110 — they must not produce side effects, so
 * CSRF protection is unnecessary (and requiring a custom header on GET would
 * break <img>, <link>, and other browser-initiated reads).
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Returns true if the request origin matches the deployment.
 *
 * Browsers ALWAYS set the `Origin` header on state-changing same-site requests
 * and on cross-origin requests. A cross-site form or fetch from an attacker's
 * domain will carry the attacker's origin, which won't match, so the request
 * is blocked. We also accept `X-Requested-With: XMLHttpRequest` as an
 * alternative signal (used by lib/api/client.ts) — a custom header forces a
 * CORS preflight from another origin, which our server will reject.
 *
 * Edge cases handled:
 *   - Server-side calls (server actions, cron) may have no Origin → allowed if
 *     they also have no Referer (indicates non-browser caller).
 *   - `null` Origin (privacy redirects, data: URIs) is rejected.
 */
function passesCsrfCheck(req: NextRequest): boolean {
  // Custom XHR header is sufficient — a cross-origin request cannot set it
  // without a preflight, and our server sends no permissive CORS headers.
  if (req.headers.get('x-requested-with') === 'XMLHttpRequest') return true

  const origin = req.headers.get('origin')

  // No Origin AND no Referer → non-browser caller (server action, cron, curl).
  if (!origin && !req.headers.get('referer')) return true

  // `null` string is sent by privacy redirects — reject it.
  if (!origin || origin === 'null') return false

  // Match against the deployment's own origins.
  const allowed = new Set([
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_API_URL,
    // Dev environments
    'http://localhost:3000',
    'http://localhost:3004',
    'http://localhost:3011',
  ].filter(Boolean))

  // Also accept the request's own host as origin (covers Vercel preview URLs).
  const requestOrigin = `${req.nextUrl.protocol}//${req.nextUrl.host}`
  allowed.add(requestOrigin)

  return allowed.has(origin)
}

/**
 * Wraps an API route handler with authentication, gym resolution, rate limiting,
 * and CSRF protection.
 *
 * Ensures:
 * 1. State-changing requests pass an Origin / X-Requested-With check — blocks
 *    classic CSRF (cross-site form submissions, fetches from attacker domains)
 * 2. User is authenticated via server-side cookies
 * 3. User's gym is resolved server-side (never trusts client gym_id)
 * 4. Rate limiting is applied
 * 5. Errors are caught and returned as controlled JSON
 *
 * Usage:
 *   export const GET = withAuth('MY_ROUTE_GET', async (req, { user, gym, supabase, log }) => {
 *     // ... your handler logic
 *     return NextResponse.json({ success: true, data })
 *   })
 */
export function withAuth(
  routeName: string,
  handler: HandlerFn,
  options?: { rateLimit?: number }
) {
  return async (req: NextRequest) => {
    const log = apiLogger(routeName)
    try {
      // ── CSRF guard ─────────────────────────────────────────────────────────
      // Safe (read-only) methods are exempt. For everything else, validate that
      // the request comes from our own origin.
      if (!SAFE_METHODS.has(req.method) && !passesCsrfCheck(req)) {
        log.summary(403)
        return NextResponse.json(
          { success: false, error: { code: 'CSRF_REJECTED', message: 'Forbidden' } },
          { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
        )
      }

      log.start('AUTH')
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      log.end('AUTH')

      if (authError || !user) {
        log.summary(401)
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
          { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
        )
      }

      const rpm = options?.rateLimit ?? ROUTE_LIMITS.DEFAULT
      const { allowed } = await checkRateLimit(user.id, routeName, rpm)
      if (!allowed) {
        log.summary(429)
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
          { status: 429 }
        )
      }

      log.start('GET_GYM')
      const gym = await getGymForUser(supabase, user.id)
      log.end('GET_GYM')

      if (!gym) {
        log.summary(404)
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } },
          { status: 404 }
        )
      }

      const ctx: AuthContext = { user, gym, supabase, log }
      const response = await handler(req, ctx)
      log.summary(response.status)
      return response
    } catch (err: unknown) {
      log.error(`Unhandled exception in ${routeName}`, err)
      log.summary(500)
      return NextResponse.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
      )
    }
  }
}

/** Helper to return a consistent JSON error response */
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

/** Helper to return a consistent JSON success response */
export function apiSuccess(data: unknown, status = 200, meta?: Record<string, unknown>) {
  return NextResponse.json(
    { success: true, data, ...(meta ? { meta } : {}) },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

/** Wrap a Supabase error into an API error response */
export function handleSupabaseError(error: { code: string; message: string }) {
  const mapped = mapSupabaseError(error)
  return apiError(mapped.status, mapped.code, mapped.message)
}

/** Validate UUID format */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
