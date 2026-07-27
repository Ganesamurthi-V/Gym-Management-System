import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { generateRequestId, REQUEST_ID_HEADER } from '@/lib/logger'
import { computeSubscriptionState } from '@/lib/subscription-utils'
import {
  GRAPH_HOSTNAME,
  BARE_HOSTNAME,
  APP_HOSTNAME,
  isAllowedGraphRoute,
  unauthorizedResponse,
  rateLimitedResponse,
  SECURITY_HEADERS,
} from '@/lib/graph-domain'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ─── Rate limiter for graph domain (Upstash Redis — persistent across instances)
let _graphLimiter: Ratelimit | null = null
function getGraphLimiter(): Ratelimit | null {
  if (_graphLimiter) return _graphLimiter
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  _graphLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(120, '1 m'),
    prefix: 'ratelimit:graph_proxy',
  })
  return _graphLimiter
}

// Pages that require auth check — everything else passes through immediately
const PROTECTED_PREFIXES = ['/dashboard', '/members', '/payments', '/attendance', '/reports', '/dues', '/import', '/inventory', '/account', '/subscription']
const AUTH_PREFIX = '/auth'

// These auth pages must never redirect away even when a session exists,
// because they are part of the email-verification + password-setup flow.
const AUTH_SETUP_PATHS = ['/auth/setup-password']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host')?.replace(/:\d+$/, '') ?? ''

  // ══════════════════════════════════════════════════════════════════════════════
  // ── BARE DOMAIN REDIRECT ──────────────────────────────────────────────────────
  // gymflow.sbs (no subdomain) should never serve the app directly — redirect
  // to the canonical app subdomain to prevent content duplication and ensure
  // all auth cookies are scoped correctly.
  // ══════════════════════════════════════════════════════════════════════════════
  if (hostname === BARE_HOSTNAME || hostname === `www.${BARE_HOSTNAME}`) {
    const url = request.nextUrl.clone()
    url.host = APP_HOSTNAME
    url.port = ''
    return NextResponse.redirect(url, 301)
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ── GRAPH DOMAIN ISOLATION ────────────────────────────────────────────────────
  // graph.gymflow.sbs serves ONLY whitelisted API routes — no frontend pages,
  // no static assets, no React pages, no internal APIs.
  // ══════════════════════════════════════════════════════════════════════════════
  if (hostname.includes(GRAPH_HOSTNAME)) {
    // Rate limit by IP (Upstash Redis — persistent across serverless instances)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    const limiter = getGraphLimiter()
    if (limiter) {
      const { success } = await limiter.limit(ip)
      if (!success) {
        return rateLimitedResponse() as unknown as NextResponse
      }
    }

    // Only allow whitelisted routes
    if (isAllowedGraphRoute(pathname)) {
      const res = NextResponse.next()
      res.headers.delete('x-powered-by')
      res.headers.delete('server')
      return res
    }

    // Everything else on graph domain → 401 (never render frontend)
    return unauthorizedResponse() as unknown as NextResponse
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ── NORMAL APP DOMAIN (app.gymflow.sbs) ────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Stamp every request with a unique ID ──────────────────────────────────
  // Re-use an existing ID (e.g. from upstream proxy) or generate a fresh one.
  // The ID is forwarded both on the request (visible to route handlers/pages)
  // and on the response (visible in browser devtools Network tab).
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? generateRequestId()

  // Clone the request headers so we can inject the ID
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)

  // Skip auth check for paths that don't need it
  const needsCheck =
    PROTECTED_PREFIXES.some(p => pathname.startsWith(p)) ||
    pathname.startsWith(AUTH_PREFIX) ||
    pathname === '/'

  if (!needsCheck) {
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    res.headers.set(REQUEST_ID_HEADER, requestId)
    return res
  }

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !pathname.startsWith(AUTH_PREFIX)) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const res = NextResponse.redirect(url)
    // Preserve cookies that might have been updated during session refresh
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value, cookie)
    })
    res.headers.set(REQUEST_ID_HEADER, requestId)
    return res
  }

  if (user && pathname.startsWith(AUTH_PREFIX) && !AUTH_SETUP_PATHS.some(p => pathname.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    const res = NextResponse.redirect(url)
    // Preserve cookies that might have been updated during session refresh
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value, cookie)
    })
    res.headers.set(REQUEST_ID_HEADER, requestId)
    return res
  }

  // ── Subscription expiry guard ─────────────────────────────────────────────
  // Runs only for authenticated users on protected routes (not /subscription itself)
  if (user && PROTECTED_PREFIXES.some(p => pathname.startsWith(p)) && !pathname.startsWith('/subscription')) {
    const { data: gym } = await supabase
      .from('gyms')
      .select('subscription_status, trial_ends_at, subscription_ends_at')
      .eq('owner_id', user.id)
      .single()

    const subState = computeSubscriptionState(gym)

    if (subState.isExpired) {
      const url = request.nextUrl.clone()
      url.pathname = '/subscription'
      const res = NextResponse.redirect(url)
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        res.cookies.set(cookie.name, cookie.value, cookie)
      })
      res.headers.set(REQUEST_ID_HEADER, requestId)
      return res
    }
  }

  // Propagate the request ID to the response so it appears in browser devtools
  supabaseResponse.headers.set(REQUEST_ID_HEADER, requestId)
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
