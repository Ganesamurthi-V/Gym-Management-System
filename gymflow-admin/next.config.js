const path = require('path')

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
      "script-src 'self' 'unsafe-inline'",   // unsafe-inline needed for Next.js inline scripts
      "style-src 'self' 'unsafe-inline'",    // unsafe-inline needed for Tailwind/CSS-in-JS
      "img-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "font-src 'self'",
      "frame-ancestors 'none'",              // equivalent to X-Frame-Options: DENY
    ].join('; '),
  },
]

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '../'),
  async headers() {
    return [{ source: '/(.*)', headers: adminSecurityHeaders }]
  },
}

module.exports = nextConfig
