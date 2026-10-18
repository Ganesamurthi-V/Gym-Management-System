/** @type {import('next').NextConfig} */

// Issue 12 fix: Added full Content Security Policy and HSTS headers.
// The admin panel has access to all gym data — it requires at least the same
// security posture as the main app.
const adminSecurityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // HSTS: force HTTPS for 2 years, including subdomains (preload-eligible)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Disable unused browser features in the admin panel
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      process.env.NODE_ENV === 'production' 
        ? "script-src 'self' 'unsafe-inline'" 
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig = {
  reactStrictMode: true,
  // Next 16 builds with Turbopack, which inferred the workspace root from the parent
  // package-lock.json and then compiled the owner app's instrumentation.ts and
  // sentry.*.config.ts. Those need @sentry/nextjs, which the admin Vercel project never
  // installs, so the deploy failed. The admin app imports nothing outside this folder.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  async headers() {
    return [{ source: '/(.*)', headers: adminSecurityHeaders }]
  },
}

module.exports = nextConfig
