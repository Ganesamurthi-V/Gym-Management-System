/**
 * lib/graph-domain.ts
 *
 * Centralized configuration for the graph.gymflow.sbs domain isolation.
 *
 * This file defines:
 *   - The graph API hostname
 *   - Allowed route prefixes (whitelist)
 *   - Allowed upstream endpoint segments (whitelist)
 *   - Security response helpers
 *
 * Extending the whitelist: add entries to ALLOWED_ROUTES or ALLOWED_ENDPOINTS below.
 */

// ─── Hostname ─────────────────────────────────────────────────────────────────

export const GRAPH_HOSTNAME = 'graph.gymflow.sbs'

/** The bare domain — should redirect to the app subdomain, never serve frontend directly. */
export const BARE_HOSTNAME = 'gymflow.sbs'

/** The canonical app domain — serves BOTH /owner/* and /m/* after the merge. */
export const APP_HOSTNAME = 'app.gymflow.sbs'

/**
 * The retired member-app domain.
 *
 * The member PWA used to be a separate deployment on this host with its routes
 * at the domain root (`/home`, `/workout`, ...). It is now `app.gymflow.sbs/m/*`.
 * Activation links already delivered over WhatsApp, installed PWAs and browser
 * bookmarks still point here, so while the DNS record remains attached to this
 * project the middleware maps those URLs onto the unified app instead of 404ing.
 */
export const LEGACY_MEMBER_HOSTNAME = 'member.gymflow.sbs'

// ─── Allowed API route prefixes on graph.gymflow.sbs ──────────────────────────
// Only these routes are reachable. Everything else → 401.

export const ALLOWED_ROUTES = [
  '/api/graph/',   // Reverse proxy to Meta Graph API
  '/api/webhook',  // Meta webhook receiver
  '/api/health',   // Health check endpoint
]

// ─── Allowed upstream endpoint segments (Meta Graph API whitelist) ─────────────
// The proxy will only forward requests whose path contains one of these segments.
// Unknown endpoints → 403 Forbidden.

export const ALLOWED_ENDPOINTS = [
  'messages',
  'media',
  'uploads',
  'phone_numbers',
  'webhooks',
  'message_templates',
]

// ─── Security headers applied to all graph domain responses ───────────────────

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message: 'No valid API credentials provided.',
      status: 401,
      service: 'GymFlow Graph API',
      timestamp: new Date().toISOString(),
    }),
    { status: 401, headers: { ...SECURITY_HEADERS } }
  )
}

export function forbiddenResponse(message = 'Endpoint not allowed.'): Response {
  return new Response(
    JSON.stringify({
      error: 'Forbidden',
      message,
      status: 403,
      service: 'GymFlow Graph API',
      timestamp: new Date().toISOString(),
    }),
    { status: 403, headers: { ...SECURITY_HEADERS } }
  )
}

export function rateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      status: 429,
      service: 'GymFlow Graph API',
      timestamp: new Date().toISOString(),
    }),
    { status: 429, headers: { ...SECURITY_HEADERS, 'Retry-After': '60' } }
  )
}

export function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: { message, type: 'ProxyError', code: status },
      service: 'GymFlow Graph API',
      timestamp: new Date().toISOString(),
    }),
    { status, headers: { ...SECURITY_HEADERS } }
  )
}

/**
 * Check if a given request path is allowed on the graph domain.
 */
export function isAllowedGraphRoute(pathname: string): boolean {
  return ALLOWED_ROUTES.some(prefix => pathname.startsWith(prefix))
}

/**
 * Check if a proxy path segment is an allowed Meta Graph endpoint.
 * The path is the portion after /api/graph/ (e.g. "v25.0/123456/messages").
 */
export function isAllowedEndpoint(proxyPath: string): boolean {
  const segments = proxyPath.toLowerCase().split('/')
  return ALLOWED_ENDPOINTS.some(endpoint => segments.includes(endpoint))
}
