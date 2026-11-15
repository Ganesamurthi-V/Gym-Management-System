import type { MetadataRoute } from 'next'

/**
 * Generates https://app.thegymflow.in/sitemap.xml
 *
 * Intentionally empty. This host is the application: every route is auth-gated
 * or token-bearing and is disallowed in robots.ts, and all search visibility
 * lives on www.thegymflow.in (landing-page). Listing a disallowed URL here would
 * surface as "Submitted URL blocked by robots.txt" in Search Console, but a
 * missing file is reported by scanners as a 404, so a valid empty urlset is the
 * quiet option. robots.ts deliberately does not advertise it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return []
}
