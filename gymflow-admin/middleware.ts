import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminSession, COOKIE_NAME } from './lib/auth'
import { generateRequestId, REQUEST_ID_HEADER } from './lib/logger'

/*
  Paths that bypass the session/Bearer check here because they authenticate
  themselves.

  /api/push/dispatch is called by Postgres (pg_net) on every new notification and
  authenticates with CRON_SECRET via the x-cron-secret header — not an admin
  session. Without this entry the middleware answered 401 before the handler ever
  ran, so no push was ever sent. The route itself fails closed when CRON_SECRET is
  unset or mismatched, so it is not actually public.
*/
const PUBLIC_PATHS = ['/auth', '/api/auth', '/api/push/dispatch']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Stamp every admin request with a unique request ID
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? generateRequestId()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)

  // Allow public paths through
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    res.headers.set(REQUEST_ID_HEADER, requestId)
    return res
  }

  // Allow Next.js internals and static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  const token = request.cookies.get(COOKIE_NAME)?.value
  let isAuthed = token ? await verifyAdminSession(token) : false

  // API-to-API / mobile clients authenticate with a Bearer token instead of
  // the session cookie (mirrors lib/auth.ts verifyRequestAuth)
  if (!isAuthed) {
    const bearer = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (bearer && bearer === process.env.ADMIN_PANEL_SECRET) isAuthed = true
  }

  if (!isAuthed) {
    // API routes get a JSON 401 — an HTML redirect is useless to API clients
    if (pathname.startsWith('/api')) {
      const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      res.headers.set(REQUEST_ID_HEADER, requestId)
      return res
    }
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    const res = NextResponse.redirect(url)
    res.headers.set(REQUEST_ID_HEADER, requestId)
    return res
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set(REQUEST_ID_HEADER, requestId)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
