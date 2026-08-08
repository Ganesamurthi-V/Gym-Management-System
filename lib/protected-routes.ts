/**
 * lib/protected-routes.ts
 *
 * Shared route classification used by BOTH `middleware.ts` (Edge runtime) and
 * `components/layout/AppShell.tsx` (Node runtime), so the auth gate and the
 * subscription gate can never drift apart.
 *
 * Pure constants and string checks only — no imports, no DB, no Node built-ins.
 *
 * ── UNIFIED APP NOTE ────────────────────────────────────────────────────────
 * Every owner route now lives under `/owner/*` so it cannot collide with the
 * member experience under `/m/*`. `/attendance` in particular exists in both
 * products, which is why namespacing was required rather than route groups.
 */

/** Landing route for an authenticated gym owner. */
export const OWNER_HOME = '/owner/dashboard'

/** Routes that require an authenticated gym owner. */
export const PROTECTED_PREFIXES = [
  '/owner',
] as const

export const AUTH_PREFIX = '/auth'

/**
 * Auth pages that must never redirect away even when a session exists, because
 * they are part of the email-verification + password-setup flow.
 */
export const AUTH_SETUP_PATHS = ['/auth/setup-password'] as const

/** Header the middleware uses to forward the current path to Server Components. */
export const PATHNAME_HEADER = 'x-pathname'

/** True for any route inside the owner console (including bare `/owner`). */
export function isOwnerPath(pathname: string) {
  return pathname === '/owner' || pathname.startsWith('/owner/')
}

export function isProtectedPath(pathname: string) {
  return isOwnerPath(pathname)
}

/**
 * Owner-namespaced routes that are exempt from the subscription paywall.
 *
 *  - `/owner/subscription` — an expired owner must still be able to reach the
 *    page that lets them renew.
 *  - `/owner/admin` — the platform super-admin console. It has its own
 *    ADMIN_EMAIL gate and is not a gym-owner surface, so a missing or expired
 *    gym subscription must not lock the operator out of it. Before the unified
 *    migration this lived at `/admin`, outside PROTECTED_PREFIXES, and was
 *    never paywalled; this keeps that behaviour identical.
 */
const SUBSCRIPTION_EXEMPT_PREFIXES = ['/owner/subscription', '/owner/admin'] as const

/**
 * True when the subscription paywall should be enforced for this path.
 */
export function needsSubscriptionGuard(pathname: string) {
  return (
    isProtectedPath(pathname) &&
    !SUBSCRIPTION_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))
  )
}

/**
 * ── LEGACY URL MAP ──────────────────────────────────────────────────────────
 *
 * Before the merge, owner pages were served from the domain root
 * (`/dashboard`, `/members`, ...). Existing bookmarks, browser history, PWA
 * shortcuts and any WhatsApp/email links already in the wild still point there,
 * so the middleware 308-redirects them into `/owner/*` instead of 404ing.
 *
 * Deliberately does NOT include `/attendance`: that path is ambiguous now
 * (owner attendance log vs member check-in history), so it is resolved by role
 * in the middleware rather than by a blind prefix rewrite.
 */
export const LEGACY_OWNER_PREFIXES = [
  '/dashboard',
  '/members',
  '/payments',
  '/dues',
  '/reports',
  '/import',
  '/inventory',
  '/programs',
  '/member-app',
  '/account',
  '/subscription',
  '/onboarding',
  '/admin',
] as const

/**
 * Returns the `/owner`-prefixed replacement for a legacy root-level owner URL,
 * or `null` when the path is not a legacy owner URL.
 */
export function legacyOwnerRedirect(pathname: string): string | null {
  for (const prefix of LEGACY_OWNER_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return `/owner${pathname}`
    }
  }
  return null
}
