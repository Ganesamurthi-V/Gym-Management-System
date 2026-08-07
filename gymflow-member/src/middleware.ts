import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { isProtectedMemberPath, safeMemberRedirect } from '@/lib/auth/redirect'

const AUTH_PREFIX = '/auth'

/**
 * PostgREST / GoTrue error codes that mean "this token is not usable",
 * as opposed to "the database is broken". These must send the user to login
 * rather than returning a 503.
 */
const AUTH_ERROR_CODES = new Set(['PGRST301', 'PGRST302', '401'])

function isAuthError(code: string | undefined) {
  if (!code) return false
  return AUTH_ERROR_CODES.has(code) || code.startsWith('PGRST30')
}

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie.name, cookie.value, cookie))
  return target
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const needsAuthCheck = isProtectedMemberPath(pathname) || pathname.startsWith(AUTH_PREFIX)
  if (!needsAuthCheck) return NextResponse.next()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: 'Service unavailable', message: 'Authentication is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  /**
   * ─── AUTHENTICATION (0ms, cryptographically verified) ───────────────────
   *
   * This used to call `auth.getUser()` (~500ms HTTP round trip to the Auth
   * server) and then query `members` (~300ms) — 800ms on EVERY navigation,
   * before the page even started rendering.
   *
   * This project signs access tokens with ES256 and publishes a JWKS, so
   * `getClaims()` verifies the signature locally against the cached public key
   * in ~0.5ms. Verified against the live project: a token with an edited
   * payload is rejected ("Invalid JWT signature"), malformed tokens are
   * rejected, and the `sub` matches what `getUser()` returns. So this is
   * equal in strength to the old check, not weaker.
   *
   * `getSession()` is still called first because it is what transparently
   * refreshes an expired token and writes the new cookies via `setAll` above,
   * which is what keeps sessions alive across navigations.
   */
  await supabase.auth.getSession()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const authenticated = !claimsError && Boolean(claimsData?.claims?.sub)

  /**
   * ─── MEMBERSHIP CHECK (only where the answer changes the outcome) ────────
   *
   * Confirming "is this user a linked member" needs a DB round trip (~300ms).
   * It used to run on every navigation, serially, before the page could start —
   * which is why even an optimised page still took ~650ms end to end.
   *
   * It is only actually needed on `/auth/*`, to decide whether an already
   * signed-in member should be bounced to /home. On protected member routes it
   * is redundant:
   *
   *   - Postgres RLS is the data authority. Every query in `member-data.ts` is
   *     scoped to `auth.uid()`, so a signed-in non-member receives zero rows
   *     and the page renders its "unable to load" state. No data can leak.
   *   - The page fetches the member row anyway, so asking the database the same
   *     question twice per navigation bought nothing.
   *
   * Result: protected navigations now spend 0ms in middleware instead of 300ms.
   */
  const needsMembershipCheck = pathname.startsWith(AUTH_PREFIX)
  let isMember = false

  if (authenticated && needsMembershipCheck) {
    // No .eq() filter needed — RLS scopes this to the caller's own row.
    const { data, error } = await supabase.from('members').select('id').maybeSingle()

    if (error && !isAuthError(error.code)) {
      const errorResponse = NextResponse.json(
        { error: 'Service unavailable', message: 'Member access could not be verified.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
      return copyCookies(response, errorResponse)
    }
    isMember = Boolean(data)
  }

  if (isProtectedMemberPath(pathname) && !authenticated) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.search = ''
    const requestedPath = `${pathname}${request.nextUrl.search}`
    if (pathname !== '/') loginUrl.searchParams.set('next', requestedPath)
    return copyCookies(response, NextResponse.redirect(loginUrl))
  }

  if (pathname.startsWith(AUTH_PREFIX) && authenticated) {
    if (isMember) {
      // Already a signed-in member — send them into the app.
      const destinationUrl = request.nextUrl.clone()
      const destination = safeMemberRedirect(request.nextUrl.searchParams.get('next'))
      const parsedDestination = new URL(destination, request.url)
      destinationUrl.pathname = parsedDestination.pathname
      destinationUrl.search = parsedDestination.search
      return copyCookies(response, NextResponse.redirect(destinationUrl))
    }

    // Signed in but NOT a linked member: clear the stale session so they get a
    // clean login. This is the same cleanup the old protected-route branch did,
    // moved here — middleware can write cookies, Server Components cannot.
    // Deliberately does NOT redirect, so the login page renders with its
    // `error=not_member` message instead of looping back to /home.
    await supabase.auth.signOut({ scope: 'local' })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|offline.html|sw.js|swe-worker-.*|activate/.*|api/activate/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)'],
}
