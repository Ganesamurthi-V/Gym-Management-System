import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { generateRequestId, REQUEST_ID_HEADER } from '@/lib/logger'
import { computeSubscriptionState } from '@/lib/subscription-utils'
import {
  GRAPH_HOSTNAME,
  isAllowedGraphRoute,
  unauthorizedResponse,
  rateLimitedResponse,
  SECURITY_HEADERS,
} from '@/lib/graph-domain'

// ─── Rate limiter for graph domain (in-memory, per-instance) ─────────────────
// For a more robust solution use Upstash Redis, but in-memory is sufficient for
// a single Vercel function instance with Meta as the sole caller.
const graphRateMap = new Map<string, { count: number; resetAt: number }>()
const GRAPH_RATE_LIMIT = 120      // requests per window
const GRAPH_RATE_WINDOW_MS = 60_000 // 1 minute

function checkGraphRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = graphRateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    graphRateMap.set(ip, { count: 1, resetAt: now + GRAPH_RATE_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= GRAPH_RATE_LIMIT
}

// Pages that require auth check — everything else passes through immediately
const PROTECTED_PREFIXES = ['/dashboard', '/members', '/payments', '/attendance', '/reports', '/dues', '/import', '/inventory', '/account', '/subscription']
const AUTH_PREFIX = '/auth'

// These auth pages must never redirect away even when a session exists,
// because they are part of the email-verification + password-setup flow.
const AUTH_SETUP_PATHS = ['/auth/setup-password']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host') ?? ''

  // ══════════════════════════════════════════════════════════════════════════════
  // ── GRAPH DOMAIN ISOLATION ────────────────────────────────────────────────────
  // graph.gymflow.sbs serves ONLY whitelisted API routes — no frontend pages,
  // no static assets, no React pages, no internal APIs.
  // ══════════════════════════════════════════════════════════════════════════════
  if (hostname.includes(GRAPH_HOSTNAME)) {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    if (!checkGraphRateLimit(ip)) {
      return rateLimitedResponse() as unknown as NextResponse
    }

    // Only allow whitelisted routes
    if (isAllowedGraphRoute(pathname)) {
      // Pass through — the route handler applies its own security (endpoint whitelist, etc.)
      const res = NextResponse.next()
      // Strip server identity headers
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
