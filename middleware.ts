import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { generateRequestId, REQUEST_ID_HEADER } from '@/lib/logger'

// Pages that require auth check — everything else passes through immediately
const PROTECTED_PREFIXES = ['/dashboard', '/members', '/payments', '/attendance', '/reports', '/dues', '/import']
const AUTH_PREFIX = '/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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
    res.headers.set(REQUEST_ID_HEADER, requestId)
    return res
  }

  if (user && pathname.startsWith(AUTH_PREFIX)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    const res = NextResponse.redirect(url)
    res.headers.set(REQUEST_ID_HEADER, requestId)
    return res
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
