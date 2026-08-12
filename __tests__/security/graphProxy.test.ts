/**
 * Tests for the /api/graph reverse-proxy hardening.
 *
 * Findings addressed:
 *   - The route replied with `Access-Control-Allow-Origin: *` and
 *     `Access-Control-Allow-Headers: Authorization`, inviting any web page to
 *     relay credentialed requests to Meta through our domain.
 *   - It was unauthenticated, so it acted as an open relay.
 *
 * These cover the pure, dependency-free parts of the fix. The route module
 * itself is not imported here because it pulls in `next/server` and the
 * middleware rate limiter.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  isAllowedEndpoint,
  isAllowedGraphRoute,
  getGraphProxySecret,
  GRAPH_PROXY_SECRET_HEADER,
  ALLOWED_ENDPOINTS,
} from '@/lib/graph-domain'

describe('getGraphProxySecret', () => {
  const original = process.env.GRAPH_PROXY_SECRET

  afterEach(() => {
    if (original === undefined) delete process.env.GRAPH_PROXY_SECRET
    else process.env.GRAPH_PROXY_SECRET = original
  })

  it('returns null when unset, so the optional layer stays disabled', () => {
    delete process.env.GRAPH_PROXY_SECRET
    expect(getGraphProxySecret()).toBeNull()
  })

  it('treats an empty or whitespace value as disabled', () => {
    process.env.GRAPH_PROXY_SECRET = ''
    expect(getGraphProxySecret()).toBeNull()
    process.env.GRAPH_PROXY_SECRET = '   '
    expect(getGraphProxySecret()).toBeNull()
  })

  it('returns the trimmed secret when configured', () => {
    process.env.GRAPH_PROXY_SECRET = '  s3cret-value  '
    expect(getGraphProxySecret()).toBe('s3cret-value')
  })

  it('uses a header name that is on the proxy strip-list', async () => {
    // The secret must never be forwarded upstream to Meta.
    const fs = await import('node:fs')
    const route = fs.readFileSync('app/api/graph/[...path]/route.ts', 'utf8')
    expect(GRAPH_PROXY_SECRET_HEADER).toBe('x-graph-proxy-secret')
    // Appears inside STRIP_REQUEST_HEADERS
    const stripBlock = /STRIP_REQUEST_HEADERS = new Set\(\[([\s\S]*?)\]\)/.exec(route)
    expect(stripBlock).not.toBeNull()
    expect(stripBlock![1]).toContain(GRAPH_PROXY_SECRET_HEADER)
  })
})

describe('no CORS is granted to the proxy', () => {
  it('the route no longer sets a wildcard Access-Control-Allow-Origin', async () => {
    const fs = await import('node:fs')
    const route = fs.readFileSync('app/api/graph/[...path]/route.ts', 'utf8')
    // Guard against the exact regression: granting * to any origin.
    expect(route).not.toMatch(/set\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]\s*\)/)
    expect(route).not.toMatch(/['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/)
  })

  it('the OPTIONS preflight does not approve credentialed cross-origin use', async () => {
    const fs = await import('node:fs')
    const route = fs.readFileSync('app/api/graph/[...path]/route.ts', 'utf8')
    const optionsBlock = /export async function OPTIONS[\s\S]*$/.exec(route)?.[0] ?? ''
    expect(optionsBlock).not.toContain('Access-Control-Allow-Origin')
    expect(optionsBlock).not.toContain('Access-Control-Allow-Headers')
  })

  it('the route rejects browser-originated requests', async () => {
    const fs = await import('node:fs')
    const route = fs.readFileSync('app/api/graph/[...path]/route.ts', 'utf8')
    expect(route).toContain('isBrowserOriginated')
    // The guard must run inside proxy(), before the upstream fetch.
    const proxyBody = /async function proxy\([\s\S]*?const upstream = upstreamBase\(\)/.exec(route)?.[0] ?? ''
    expect(proxyBody).toContain('isBrowserOriginated')
  })
})

describe('isAllowedGraphRoute', () => {
  it('allows only the three intended prefixes on the graph domain', () => {
    expect(isAllowedGraphRoute('/api/graph/v21.0/123/messages')).toBe(true)
    expect(isAllowedGraphRoute('/api/webhook')).toBe(true)
    expect(isAllowedGraphRoute('/api/health')).toBe(true)
  })

  it('blocks app routes, internal APIs and static assets', () => {
    expect(isAllowedGraphRoute('/owner/dashboard')).toBe(false)
    expect(isAllowedGraphRoute('/api/members')).toBe(false)
    expect(isAllowedGraphRoute('/api/gyms')).toBe(false)
    expect(isAllowedGraphRoute('/_next/static/chunk.js')).toBe(false)
    expect(isAllowedGraphRoute('/')).toBe(false)
  })
})

describe('isAllowedEndpoint', () => {
  it('allows every documented Meta endpoint', () => {
    for (const endpoint of ALLOWED_ENDPOINTS) {
      expect(isAllowedEndpoint(`v21.0/1234567890/${endpoint}`)).toBe(true)
    }
  })

  it('blocks endpoints outside the allowlist', () => {
    expect(isAllowedEndpoint('v21.0/me/accounts')).toBe(false)
    expect(isAllowedEndpoint('v21.0/1234/insights')).toBe(false)
    expect(isAllowedEndpoint('v21.0/act_123/adaccounts')).toBe(false)
  })

  it('is case insensitive', () => {
    expect(isAllowedEndpoint('v21.0/123/MESSAGES')).toBe(true)
  })

  it('matches on whole path segments, not substrings', () => {
    // "messages" must be its own segment — "notmessages" must not pass.
    expect(isAllowedEndpoint('v21.0/123/notmessages')).toBe(false)
    expect(isAllowedEndpoint('v21.0/123/messages_export')).toBe(false)
  })
})
