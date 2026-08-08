/**
 * lib/member/redirect.ts
 *
 * Member route classification for the UNIFIED app.
 *
 * Migrated from the standalone member PWA, where routes lived at the domain
 * root (`/home`, `/workout`, ...). In the unified app every member route is
 * namespaced under `/m` so it cannot collide with an owner route — notably
 * `/attendance`, which exists in BOTH experiences.
 *
 * Pure constants and string checks only: no imports, no DB, no Node built-ins,
 * so this is safe to use from Edge middleware.
 */

/** Landing route for an authenticated member. */
export const MEMBER_HOME = '/m/home'

/** Every member-facing route prefix, relative to the app root. */
export const MEMBER_ROUTE_PREFIXES = [
  '/m/home',
  '/m/workout',
  '/m/progress',
  '/m/rewards',
  '/m/profile',
  '/m/membership',
  '/m/attendance',
  '/m/payments',
  '/m/notifications',
  '/m/diet',
] as const

/** True for any route inside the member experience (including bare `/m`). */
export function isMemberPath(pathname: string) {
  return pathname === '/m' || pathname.startsWith('/m/')
}

/**
 * True for member routes that require an authenticated member session.
 * Every `/m/*` route is protected; the activation flow lives outside `/m`.
 */
export function isProtectedMemberPath(pathname: string) {
  return isMemberPath(pathname)
}

/**
 * Validates a `?next=` value before redirecting to it.
 *
 * Only same-origin member paths are allowed. Anything else — absolute URLs,
 * protocol-relative `//evil.com`, or owner routes — falls back to the member
 * home so this can never be used as an open redirect or to bounce a member
 * into the owner app.
 */
export function safeMemberRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return MEMBER_HOME

  try {
    // Base origin is arbitrary; it only lets us parse a relative path safely.
    const url = new URL(value, 'https://app.gymflow.sbs')
    if (url.origin !== 'https://app.gymflow.sbs') return MEMBER_HOME
    if (!isProtectedMemberPath(url.pathname)) return MEMBER_HOME
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return MEMBER_HOME
  }
}

/**
 * Canonical public origin for member-facing links (activation links sent over
 * WhatsApp/email, Supabase `emailRedirectTo`, etc.).
 *
 * After the unified-app migration this is `https://app.gymflow.sbs`, NOT the
 * retired `member.gymflow.sbs`. `NEXT_PUBLIC_MEMBER_APP_URL` is still honoured
 * first so an existing deployment that sets it keeps working during cutover.
 */
export function memberAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_MEMBER_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://app.gymflow.sbs'
  ).replace(/\/+$/, '')
}

/**
 * Absolute activation link for an invitation token.
 *
 * `/activate/*` deliberately sits OUTSIDE `/m` because it must be reachable
 * with no session at all — the member opens it straight from WhatsApp.
 */
export function activationUrl(token: string): string {
  return `${memberAppOrigin()}/activate/${token}`
}

/**
 * ── LEGACY member.gymflow.sbs URL MAP ───────────────────────────────────────
 *
 * The standalone member PWA served these at the domain root. Maps an incoming
 * path on the retired host onto its place in the unified app.
 *
 * `/activate/*` and `/api/activate/*` are returned unchanged: they live outside
 * `/m` in the unified app too, because they must work with no session at all.
 */
const LEGACY_MEMBER_ROOT_ROUTES = [
  'home',
  'workout',
  'progress',
  'rewards',
  'profile',
  'membership',
  'attendance',
  'notifications',
  'diet',
] as const

export function legacyMemberPath(pathname: string): string {
  // Activation + its API keep their paths.
  if (
    pathname === '/activate' ||
    pathname.startsWith('/activate/') ||
    pathname.startsWith('/api/activate/')
  ) {
    return pathname
  }

  // Already namespaced (e.g. an updated PWA hitting the old host).
  if (isMemberPath(pathname)) return pathname

  // Send sign-in to the unified login with the Member tab preselected.
  if (pathname === '/auth/login' || pathname.startsWith('/auth/login/')) {
    return '/auth/login?role=member'
  }

  for (const route of LEGACY_MEMBER_ROOT_ROUTES) {
    if (pathname === `/${route}` || pathname.startsWith(`/${route}/`)) {
      return `/m${pathname}`
    }
  }

  // Anything else on the retired host (including `/`) lands on member home.
  return MEMBER_HOME
}
