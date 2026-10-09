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
 * ─── WHY THE SITEMAP IS TINY ────────────────────────────────────────────────
 * This host is a pure application, so app/sitemap.ts lists only the public
 * sign-in page. Every other route is auth-gated or token-bearing. If a public
 * marketing surface is ever added here, list it in app/sitemap.ts.
 *
 * ─── WHY `/` IS CRAWLABLE BUT STILL MARKED noindex ELSEWHERE ─────────────────
 * `allow: '/'` deliberately lets crawlers reach the root — the disallow list only
 * covers the private subtrees. But `/` only ever 307-redirects, so Google reports
 * it as "Page with redirect" in Search Console. A <meta robots> tag cannot suppress
 * that because the page never renders. The fix lives in next.config.mjs, which sends
 * `X-Robots-Tag: noindex, follow` on the exact `/` path (a header rides the redirect
 * response, a meta tag cannot). If you ever need `/` fully out of the crawl instead,
 * add `/` to the disallow list here — but keep the header too, since robots.txt is a
 * fetch hint, not an indexing guarantee.
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
    sitemap: 'https://app.gymflow.sbs/sitemap.xml',
  }
}
