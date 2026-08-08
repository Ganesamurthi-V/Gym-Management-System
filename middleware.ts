import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { generateRequestId, REQUEST_ID_HEADER } from '@/lib/logger'
import {
  PATHNAME_HEADER,
  AUTH_PREFIX,
  AUTH_SETUP_PATHS,
  OWNER_HOME,
  isOwnerPath,
  legacyOwnerRedirect,
  LEGACY_OWNER_PREFIXES,
} from '@/lib/protected-routes'
import { MEMBER_HOME, isMemberPath, legacyMemberPath } from '@/lib/member/redirect'
import { roleFromClaims, homeForRole } from '@/lib/auth/roles'
import {
  GRAPH_HOSTNAME,
  BARE_HOSTNAME,
  APP_HOSTNAME,
  LEGACY_MEMBER_HOSTNAME,
  isAllowedGraphRoute,
  unauthorizedResponse,
  rateLimitedResponse,
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

/**
 * `/attendance` is the one legacy URL that cannot be rewritten by prefix alone:
 * it exists in BOTH experiences (owner attendance log vs member check-in
 * history), so it is resolved against the signed-in user's role instead.
 */
const AMBIGUOUS_LEGACY_PREFIX = '/attendance'

function isAmbiguousLegacyPath(pathname: string) {
  return (
    pathname === AMBIGUOUS_LEGACY_PREFIX ||
    pathname.startsWith(`${AMBIGUOUS_LEGACY_PREFIX}/`)
  )
}

/**
 * Paths that are reachable WITHOUT a session and must never be bounced to
 * login. The member activation flow lands here straight from a WhatsApp link,
 * before any session exists.
 */
const PUBLIC_PREFIXES = ['/activate', '/api/activate'] as const

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Does this request need the (cheap, local) session check at all?
 *
 * Everything outside this set short-circuits to `NextResponse.next()` so static
 * assets, webhooks, cron routes and the activation flow pay nothing.
 */
function needsAuthCheck(pathname: string) {
  if (isPublicPath(pathname)) return false
  return (
    pathname === '/' ||
    isOwnerPath(pathname) ||
    isMemberPath(pathname) ||
    pathname.startsWith(AUTH_PREFIX) ||
    isAmbiguousLegacyPath(pathname) ||
    LEGACY_OWNER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  )
}

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
  // ── RETIRED MEMBER DOMAIN ─────────────────────────────────────────────────────
  // member.gymflow.sbs used to be its own deployment with member routes at the
  // domain root. Activation links already sent over WhatsApp, installed PWAs and
  // bookmarks still point there, so those URLs are mapped onto the unified app
  // rather than 404ing. 308 preserves the method and lets the browser cache it.
  // ══════════════════════════════════════════════════════════════════════════════
  if (hostname === LEGACY_MEMBER_HOSTNAME || hostname === `www.${LEGACY_MEMBER_HOSTNAME}`) {
    const url = request.nextUrl.clone()
    const mapped = legacyMemberPath(pathname)
    const [mappedPath, mappedQuery = ''] = mapped.split('?')
    url.host = APP_HOSTNAME
    url.port = ''
    url.pathname = mappedPath
    if (mappedQuery) {
      // Merge the mapping's own query (e.g. ?role=member) with the original.
      const merged = new URLSearchParams(url.search)
      new URLSearchParams(mappedQuery).forEach((value, key) => merged.set(key, value))
      url.search = merged.toString() ? `?${merged.toString()}` : ''
    }
    return NextResponse.redirect(url, 308)
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
  // ── UNIFIED APP DOMAIN (app.gymflow.sbs) ──────────────────────────────────────
  // Serves BOTH the owner console (/owner/*) and the member PWA (/m/*) from one
  // origin, so role enforcement happens here rather than at the DNS layer.
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Stamp every request with a unique ID ──────────────────────────────────
  // Re-use an existing ID (e.g. from upstream proxy) or generate a fresh one.
  // The ID is forwarded both on the request (visible to route handlers/pages)
  // and on the response (visible in browser devtools Network tab).
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? generateRequestId()

  // Clone the request headers so we can inject the ID
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)

  // Forward the current path so Server Components (specifically AppShell, which
  // owns the subscription paywall) can apply path-based rules. `set` overwrites
  // any client-supplied value, so this cannot be spoofed.
  requestHeaders.set(PATHNAME_HEADER, pathname)

  if (!needsAuthCheck(pathname)) {
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

  /**
   * ─── AUTHENTICATION (~1ms, cryptographically verified) ────────────────────
   *
   * This used to call `auth.getUser()`, a real HTTP round trip to the Auth
   * server measured at ~173ms on EVERY protected navigation.
   *
   * This project signs access tokens with ES256 and publishes a JWKS, so
   * `getClaims()` verifies the signature locally against the cached public key
   * in ~1ms. Verified against the live project: a token with an edited payload
   * is rejected with "Invalid JWT signature", and malformed tokens are
   * rejected. So this is equal in strength to the old check, not weaker.
   *
   * `getSession()` is still called first because it is what transparently
   * refreshes an expired token and writes the new cookies through `setAll`
   * above, which is what keeps sessions alive across navigations.
   */
  await supabase.auth.getSession()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claims = !claimsError && claimsData?.claims?.sub ? claimsData.claims : null

  /**
   * Role comes off the verified JWT (`user_metadata.role`), so it costs 0ms.
   * It decides WHICH EXPERIENCE renders — it is not the authorization boundary.
   * Data access stays gated by Postgres RLS, by `app/m/layout.tsx` (confirms a
   * real `members` row), and by `AppShell` (confirms a real `gyms` row plus a
   * live subscription). A stale or forged role claim cannot leak data.
   */
  const role = roleFromClaims(claims)
  const roleHome = homeForRole(role)

  /** Redirect helper that preserves any cookies written by the session refresh. */
  const redirectTo = (target: string, status?: 301 | 302 | 307 | 308) => {
    const url = request.nextUrl.clone()
    const [nextPath, nextQuery = ''] = target.split('?')
    url.pathname = nextPath
    url.search = nextQuery ? `?${nextQuery}` : ''
    const res = status ? NextResponse.redirect(url, status) : NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value, cookie)
    })
    res.headers.set(REQUEST_ID_HEADER, requestId)
    return res
  }

  // ── 1. LEGACY ROOT-LEVEL OWNER URLS ───────────────────────────────────────
  // Pre-migration bookmarks, PWA shortcuts and links already sent over
  // WhatsApp/email point at `/dashboard`, `/members`, ... . 308 keeps the
  // method and lets the browser cache the move.
  const legacyTarget = legacyOwnerRedirect(pathname)
  if (legacyTarget) {
    return redirectTo(`${legacyTarget}${request.nextUrl.search}`, 308)
  }

  // ── 2. LEGACY /attendance — ambiguous, resolved by role ────────────────────
  if (isAmbiguousLegacyPath(pathname)) {
    if (!claims) return redirectTo('/auth/login')
    return redirectTo(role === 'member' ? '/m/attendance' : `/owner${pathname}`)
  }

  // ── 3. ROOT ───────────────────────────────────────────────────────────────
  if (pathname === '/') {
    return redirectTo(claims ? roleHome : '/auth/login')
  }

  // ── 4. UNAUTHENTICATED ────────────────────────────────────────────────────
  if (!claims) {
    if (isMemberPath(pathname)) {
      // Preserve the deep link so the member lands where they intended after
      // signing in. `safeMemberRedirect` validates it on the way back out.
      const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`)
      return redirectTo(`/auth/login?role=member&next=${next}`)
    }
    if (isOwnerPath(pathname)) {
      return redirectTo('/auth/login')
    }
    // `/auth/*` with no session — let it render.
  } else {
    // ── 5. AUTHENTICATED ON AN AUTH PAGE ────────────────────────────────────
    if (pathname.startsWith(AUTH_PREFIX)) {
      const isSetupPath = AUTH_SETUP_PATHS.some((p) => pathname.startsWith(p))

      /**
       * `error=not_member` is the escape hatch for a signed-in user whose
       * account has no `members` row (set by `app/m/layout.tsx`). Without this
       * exemption the two guards would ping-pong forever:
       *   /m/home → /auth/login?error=not_member → /m/home → ...
       * Letting the login page render lets it clear the dead session.
       */
      const isNotMemberEscape = request.nextUrl.searchParams.get('error') === 'not_member'

      if (!isSetupPath && !isNotMemberEscape) {
        return redirectTo(roleHome)
      }
    }

    // ── 6. ROLE ENFORCEMENT ACROSS EXPERIENCES ──────────────────────────────
    // A member must never see the owner console, and an owner must never see
    // the member PWA. Both are also enforced server-side by the respective
    // layouts; this just avoids rendering the wrong shell first.
    if (role === 'member' && isOwnerPath(pathname)) {
      return redirectTo(MEMBER_HOME)
    }
    if (role !== 'member' && isMemberPath(pathname)) {
      return redirectTo(OWNER_HOME)
    }
  }

  /**
   * ─── SUBSCRIPTION EXPIRY GUARD — lives in the owner layout ─────────────────
   *
   * This used to run a `gyms` SELECT here (~206ms) on every protected
   * navigation, serially, before the page could even begin rendering. It was
   * pure duplicated work: `AppShell` already fetches the same gym row to render
   * the trial banner, so the database was answering the same question twice per
   * navigation.
   *
   * The guard now lives in `AppShell` (see components/layout/AppShell.tsx),
   * mounted by `app/owner/layout.tsx`, where it reads the row that is being
   * fetched anyway and costs nothing. It still runs server-side, on every owner
   * route, before any page content is sent — so the protection is equivalent.
   *
   * `x-pathname` is forwarded above so the layout can apply the same
   * conditions this block used, via the shared `needsSubscriptionGuard()`.
   */

  // Propagate the request ID to the response so it appears in browser devtools
  supabaseResponse.headers.set(REQUEST_ID_HEADER, requestId)
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|json|html|txt|xml|webmanifest)$).*)',
  ],
}
