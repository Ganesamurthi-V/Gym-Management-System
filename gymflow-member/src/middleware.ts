import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { isProtectedMemberPath, safeMemberRedirect } from '@/lib/auth/redirect'

const AUTH_PREFIX = '/auth'

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

  const { data: { user } } = await supabase.auth.getUser()
  let isMember = false

  if (user) {
    const { data, error } = await supabase
      .from('members')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (error) {
      const errorResponse = NextResponse.json(
        { error: 'Service unavailable', message: 'Member access could not be verified.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
      return copyCookies(response, errorResponse)
    }
    isMember = Boolean(data)
  }

  if (isProtectedMemberPath(pathname) && (!user || !isMember)) {
    if (user && !isMember) await supabase.auth.signOut({ scope: 'local' })
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.search = ''
    const requestedPath = `${pathname}${request.nextUrl.search}`
    if (pathname !== '/') loginUrl.searchParams.set('next', requestedPath)
    if (user && !isMember) loginUrl.searchParams.set('error', 'not_member')
    return copyCookies(response, NextResponse.redirect(loginUrl))
  }

  if (pathname.startsWith(AUTH_PREFIX) && user && isMember) {
    const destinationUrl = request.nextUrl.clone()
    const destination = safeMemberRedirect(request.nextUrl.searchParams.get('next'))
    const parsedDestination = new URL(destination, request.url)
    destinationUrl.pathname = parsedDestination.pathname
    destinationUrl.search = parsedDestination.search
    return copyCookies(response, NextResponse.redirect(destinationUrl))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|offline.html|sw.js|swe-worker-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)'],
}
