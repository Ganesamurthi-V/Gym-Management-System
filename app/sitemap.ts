import type { MetadataRoute } from 'next'

/**
 * Generates https://app.gymflow.sbs/sitemap.xml
 *
 * This host is an application, so the only public, indexable surface is the
 * sign-in page. Everything else is auth-gated or token-bearing and is
 * disallowed in robots.ts. A sitemap that exists (rather than 404s) keeps
 * scanners and Search Console from reporting a broken reference.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://app.gymflow.sbs/auth/login' }]
}
