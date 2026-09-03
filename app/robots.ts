import type { MetadataRoute } from 'next'

/**
 * Generates https://app.gymflow.sbs/robots.txt
 *
 * ─── WHY THE DISALLOW LIST LOOKS LIKE THIS ──────────────────────────────────
 * Every path below is a real segment of this app. The obvious-looking entries
 * (`/admin/`, `/dashboard/`, `/member/`, `/login`, `/signup`) do NOT exist here
 * and would silently protect nothing:
 *
 *     /owner/admin/       not /admin/
 *     /owner/dashboard/   not /dashboard/
 *     /m/                 not /member/
 *     /auth/login         not /login
 *     /auth/create-account   not /signup
 *
 * `/owner/` covers the whole owner console including admin and dashboard, and
 * `/m/` covers the entire member PWA, so both are single entries.
 *
 * `/activate/` and `/auth/` matter most and are the easiest to forget. Those
 * pages are reachable with NO session, and two of them carry a one-time token in
 * the URL — `/activate/verifying#token_hash=…` and
 * `/auth/setup-password#token_hash=…`. They must never be crawled.
 *
 * ─── WHY THERE IS NO sitemap ENTRY ──────────────────────────────────────────
 * This host is a pure application, not a marketing site. `app/page.tsx` redirects
 * to `/auth/login` or the role home, so `/` has no indexable content, and every
 * other route is auth-gated or token-bearing. A sitemap here would either be
 * empty or list a redirect, and declaring one that 404s shows up as an error in
 * Search Console. If a public marketing surface is ever added to this host, add
 * `app/sitemap.ts` and reference it here at the same time.
 *
 * ─── robots.txt IS NOT AN INDEXING GUARANTEE ────────────────────────────────
 * It asks crawlers not to FETCH these URLs. A disallowed URL discovered through
 * an external link can still surface as a bare result with no snippet. The
 * guarantee comes from `noindex`, which is declared as metadata on each private
 * subtree: app/owner/layout.tsx, app/m/layout.tsx, app/auth/layout.tsx and
 * app/activate/layout.tsx.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/owner/',    // owner console, incl. /owner/admin and /owner/dashboard
        '/m/',        // member PWA
        '/auth/',     // login, create-account, setup-password (token in fragment)
        '/activate/', // member activation links (one-time token in fragment)
        '/api/',
      ],
    },
  }
}
