const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://content-crawdad-120459.upstash.io https://maps.googleapis.com https://maps.gstatic.com",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-ancestors 'none'",
      "worker-src 'self' blob:",
    ].join('; '),
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
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
      dynamic: 30,   // cache dynamic route RSC payloads 30s client-side
      static: 180,   // cache static route RSC payloads 3min client-side
    },
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: [
        'localhost:3000',
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

module.exports = nextConfig


// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "gym-flow",
  project: "gymflow-production",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
