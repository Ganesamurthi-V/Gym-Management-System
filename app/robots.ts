import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { GRAPH_HOSTNAME } from '@/lib/graph-domain'

/**
 * Generates https://app.gymflow.sbs/robots.txt
 *
 * ─── WHY THE DISALLOW LIST LOOKS LIKE THIS ──────────────────────────────────
 * Every path below is a real segment of this app. The obvious-looking entries
 * (`/admin/`, `/dashboard/`, `/member/`, `/login`, `/signup`) do NOT exist here
 * and would silently protect nothing:
 *
 *     /owner/dashboard/   not /dashboard/
 *     /m/                 not /member/
 *     /auth/login         not /login
 *     /auth/create-account   not /signup
 *
 * `/owner/` covers the whole owner console including the dashboard, and
 * `/m/` covers the entire member PWA, so both are single entries.
 *
 * `/activate/` and `/auth/` matter most and are the easiest to forget. Those
 * pages are reachable with NO session, and two of them carry a one-time token in
 * the URL — `/activate/verifying#token_hash=…` and
 * `/auth/setup-password#token_hash=…`. They must never be crawled.
 *
 * ─── WHY THE SITEMAP IS EMPTY AND NOT ADVERTISED ────────────────────────────
 * This host is a pure application and all search visibility lives on
 * www.gymflow.sbs. app/sitemap.ts exists only so /sitemap.xml is a valid empty
 * urlset instead of a 404; it is not referenced here on purpose.
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
export default async function robots(): Promise<MetadataRoute.Robots> {
  // graph.gymflow.sbs is an API-only proxy, but the middleware matcher skips *.txt, so its
  // /robots.txt was this file's `allow: '/'`. Google then kept fetching graph's `/` and listing
  // the 401 in Search Console. Tell crawlers to stay off that host entirely.
  const host = (await headers()).get('host') ?? ''
  if (host.includes(GRAPH_HOSTNAME)) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/owner/',    // owner console, incl. /owner/dashboard
        '/m/',        // member PWA
        '/auth/',     // login, create-account, setup-password (token in fragment)
        '/activate/', // member activation links (one-time token in fragment)
        '/api/',
      ],
    },
  }
}
