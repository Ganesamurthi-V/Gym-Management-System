const MEMBER_ROUTE_PREFIXES = [
  '/home',
  '/workout',
  '/progress',
  '/rewards',
  '/profile',
  '/membership',
  '/attendance',
  '/payments',
  '/notifications',
  '/diet',
] as const

export function isProtectedMemberPath(pathname: string) {
  return pathname === '/' || MEMBER_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function safeMemberRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/home'

  try {
    const url = new URL(value, 'https://member.gymflow.sbs')
    if (url.origin !== 'https://member.gymflow.sbs' || !isProtectedMemberPath(url.pathname)) return '/home'
    return url.pathname === '/' ? '/home' : `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/home'
  }
}
