import withSerwistInit from '@serwist/next'
import { withSentryConfig } from '@sentry/nextjs'

/**
 * ── WHY THIS FILE IS NOW ESM ─────────────────────────────────────────────────
 * `@serwist/next` ships ESM only (`"type": "module"`, `.mjs` entry points), so
 * it cannot be `require()`d from a CommonJS `next.config.js`. The config was
 * converted to `.mjs` during the unified-app migration; everything else in it is
 * carried over unchanged.
 */

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Hardening carried over from the member app's stricter policy. None of
      // these are new restrictions on anything the app actually does.
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // `blob:` is required by the member membership-card QR renderer.
      "img-src 'self' blob: data: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://content-crawdad-120459.upstash.io https://maps.googleapis.com https://maps.gstatic.com https://*.sentry.io",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-ancestors 'none'",
      "worker-src 'self' blob:",
      // Required so the browser is allowed to fetch manifest-owner.json /
      // manifest-member.json for PWA installation.
      "manifest-src 'self'",
    ].join('; '),
  },
]

/**
 * Service worker for the unified PWA.
 *
 * ONE service worker serves both experiences because they share an origin. It
 * only ever caches same-origin static assets (script/style/font/image) and the
 * offline shell — never navigations, never Supabase responses. See app/sw.ts.
 */
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [
    {
      url: '/offline.html',
      revision: process.env.VERCEL_GIT_COMMIT_SHA ?? 'development',
    },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  experimental: {
    // Issue 4 fix: Set staleTimes to enable client-side router cache for
    // dynamic routes. Next.js 15 defaults to 0s for dynamic routes, meaning
    // every single navigation (even back to a page just visited) triggers a
    // full RSC round-trip. 30s is conservative: all mutation paths in this app
    // already call invalidateMembersCache() / router.refresh(), so stale
    // RSC payloads will not be served after data-mutating user actions.
    staleTimes: {
      // Raised from 30s. These pages are per-owner and read the auth cookie, so
      // they can never live in the shared server-side Full Route Cache — the
      // browser-scoped Router Cache is the only safe place to cache them.
      // Re-opening an already-visited tab within this window renders instantly
      // with ZERO server round trip. Mutations already call
      // invalidateMembersCache() / router.refresh(), so writes still show up.
      dynamic: 180,  // cache dynamic route RSC payloads 3min client-side
      static: 300,   // cache static route RSC payloads 5min client-side
    },
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: [
        'localhost:3000',
        'localhost:3004',
        process.env.NEXT_PUBLIC_APP_URL,
      ].filter(Boolean),
    },
    // Tree-shake lucide-react and date-fns — only import used icons/functions
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },

  // Keep ExcelJS server-side only — prevents it from being bundled into client chunks
  serverExternalPackages: ['exceljs'],

  compiler: {
    // Remove console.log in production builds
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // Aggressive chunk splitting for better caching
  webpack(config, { isServer }) {
    if (!isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          // Isolate supabase into its own chunk — rarely changes
          supabase: {
            test: /[\\/]node_modules[\\/]@supabase[\\/]/,
            name: 'supabase',
            chunks: 'all',
            priority: 20,
          },
          // date-fns into its own chunk
          dateFns: {
            test: /[\\/]node_modules[\\/]date-fns[\\/]/,
            name: 'date-fns',
            chunks: 'all',
            priority: 15,
          },
        },
      }
    }
    return config
  },
}

// Serwist is applied first (inner) so Sentry's webpack wrapper composes over it.
export default withSentryConfig(withSerwist(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'gym-flow',
  project: 'gymflow-production',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet
    // work with App Router route handlers.)
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
})
