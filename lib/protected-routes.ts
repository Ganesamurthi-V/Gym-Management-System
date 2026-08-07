/**
 * lib/protected-routes.ts
 *
 * Shared route classification used by BOTH `middleware.ts` (Edge runtime) and
 * `components/layout/AppShell.tsx` (Node runtime), so the auth gate and the
 * subscription gate can never drift apart.
 *
 * Pure constants and string checks only — no imports, no DB, no Node built-ins.
 */

/** Routes that require an authenticated gym owner. */
export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/members',
  '/payments',
  '/attendance',
  '/reports',
  '/dues',
  '/import',
  '/inventory',
  '/programs',
  '/member-app',
  '/account',
  '/subscription',
] as const

export const AUTH_PREFIX = '/auth'

/**
 * Auth pages that must never redirect away even when a session exists, because
 * they are part of the email-verification + password-setup flow.
 */
export const AUTH_SETUP_PATHS = ['/auth/setup-password'] as const

/** Header the middleware uses to forward the current path to Server Components. */
export const PATHNAME_HEADER = 'x-pathname'

export function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
}

/**
 * True when the subscription paywall should be enforced for this path.
 * Excludes `/subscription` itself, otherwise an expired owner could never
 * reach the page that lets them renew.
 */
export function needsSubscriptionGuard(pathname: string) {
  return isProtectedPath(pathname) && !pathname.startsWith('/subscription')
}
