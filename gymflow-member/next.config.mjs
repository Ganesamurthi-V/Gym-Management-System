import { fileURLToPath } from 'node:url'
import withSerwistInit from '@serwist/next'

const isDevelopment = process.env.NODE_ENV !== 'production'
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
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
  outputFileTracingRoot: projectRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
    staleTimes: { dynamic: 30, static: 180 },
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
}

export default withSerwist(nextConfig)
