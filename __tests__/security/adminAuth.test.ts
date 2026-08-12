/**
 * Regression tests for the platform-admin bearer-auth decision logic.
 *
 * These lock in the fix for the auth bypass found during the credential audit.
 * The vulnerable routes (`/api/gyms`, `/api/gyms/[id]`, `/api/gyms/[id]/status`,
 * `/api/gyms/[id]/subscription`) each compared:
 *
 *     if (token !== process.env.ADMIN_PASSWORD) return 401
 *
 * With ADMIN_PASSWORD unset and no Authorization header, both sides were
 * `undefined`, `undefined !== undefined` was false, and the request proceeded to
 * a SERVICE-ROLE Supabase client — unauthenticated cross-tenant read/write.
 */

import { describe, it, expect } from 'vitest'
import {
  decideAdminAuth,
  extractBearerToken,
  constantTimeEqual,
  MIN_ADMIN_SECRET_LENGTH,
} from '@/lib/api/adminSecret'

const VALID_SECRET = 'a'.repeat(48) // realistic openssl rand -hex 32 length

describe('decideAdminAuth — the original bypass', () => {
  it('DENIES when the secret is unset and no token is sent (the exact bypass)', () => {
    // Old behaviour: undefined !== undefined === false → request ALLOWED.
    expect(decideAdminAuth(undefined, undefined).verdict).toBe('misconfigured')
    expect(decideAdminAuth(null, null).verdict).toBe('misconfigured')
  })

  it('DENIES when the secret is an empty string and no token is sent', () => {
    expect(decideAdminAuth(undefined, '').verdict).toBe('misconfigured')
    expect(decideAdminAuth('', '').verdict).toBe('misconfigured')
  })

  it('DENIES when the secret is whitespace only', () => {
    expect(decideAdminAuth('Bearer    ', '    ').verdict).toBe('misconfigured')
  })

  it('reports misconfiguration rather than a token problem, so it cannot be probed', () => {
    // An attacker sending any token against an unconfigured deployment learns
    // only that the service is unavailable — never that a token was close.
    const a = decideAdminAuth('Bearer anything', undefined)
    const b = decideAdminAuth(undefined, undefined)
    expect(a.verdict).toBe('misconfigured')
    expect(b.verdict).toBe('misconfigured')
  })
})

describe('decideAdminAuth — secret strength', () => {
  it('treats a too-short secret as misconfigured', () => {
    const short = 'x'.repeat(MIN_ADMIN_SECRET_LENGTH - 1)
    expect(decideAdminAuth(`Bearer ${short}`, short).verdict).toBe('misconfigured')
  })

  it('accepts a secret at exactly the minimum length', () => {
    const exact = 'x'.repeat(MIN_ADMIN_SECRET_LENGTH)
    expect(decideAdminAuth(`Bearer ${exact}`, exact).verdict).toBe('ok')
  })
})

describe('decideAdminAuth — token handling', () => {
  it('ALLOWS a correct bearer token', () => {
    expect(decideAdminAuth(`Bearer ${VALID_SECRET}`, VALID_SECRET).verdict).toBe('ok')
  })

  it('DENIES a wrong token', () => {
    expect(decideAdminAuth(`Bearer ${'b'.repeat(48)}`, VALID_SECRET).verdict).toBe('invalid_token')
  })

  it('DENIES a missing Authorization header', () => {
    expect(decideAdminAuth(undefined, VALID_SECRET).verdict).toBe('missing_token')
    expect(decideAdminAuth(null, VALID_SECRET).verdict).toBe('missing_token')
    expect(decideAdminAuth('', VALID_SECRET).verdict).toBe('missing_token')
  })

  it('DENIES a Bearer scheme with an empty token', () => {
    expect(decideAdminAuth('Bearer', VALID_SECRET).verdict).toBe('missing_token')
    expect(decideAdminAuth('Bearer ', VALID_SECRET).verdict).toBe('missing_token')
    expect(decideAdminAuth('Bearer      ', VALID_SECRET).verdict).toBe('missing_token')
  })

  it('DENIES a non-Bearer scheme even when the credential is correct', () => {
    expect(decideAdminAuth(`Basic ${VALID_SECRET}`, VALID_SECRET).verdict).toBe('missing_token')
    expect(decideAdminAuth(VALID_SECRET, VALID_SECRET).verdict).toBe('missing_token')
  })

  it('DENIES a token that only prefixes the secret', () => {
    expect(decideAdminAuth(`Bearer ${VALID_SECRET.slice(0, 20)}`, VALID_SECRET).verdict)
      .toBe('invalid_token')
  })

  it('DENIES a token with trailing padding that would otherwise trim to a match', () => {
    // Guard against accidental over-normalisation making a wrong token pass.
    expect(decideAdminAuth(`Bearer ${VALID_SECRET}x`, VALID_SECRET).verdict).toBe('invalid_token')
  })

  it('is case sensitive on the token', () => {
    const mixed = 'AbCdEfGhIjKlMnOpQrSt'
    expect(decideAdminAuth(`Bearer ${mixed.toLowerCase()}`, mixed).verdict).toBe('invalid_token')
  })

  it('accepts a lowercase "bearer" scheme (HTTP schemes are case-insensitive)', () => {
    expect(decideAdminAuth(`bearer ${VALID_SECRET}`, VALID_SECRET).verdict).toBe('ok')
  })
})

describe('extractBearerToken', () => {
  it('returns the token for a well-formed header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123')
  })

  it('returns null for absent, empty, or non-Bearer headers', () => {
    expect(extractBearerToken(undefined)).toBeNull()
    expect(extractBearerToken(null)).toBeNull()
    expect(extractBearerToken('')).toBeNull()
    expect(extractBearerToken('Bearer')).toBeNull()
    expect(extractBearerToken('Bearer   ')).toBeNull()
    expect(extractBearerToken('Basic abc')).toBeNull()
  })
})

describe('constantTimeEqual', () => {
  it('matches identical strings', () => {
    expect(constantTimeEqual('secret-value', 'secret-value')).toBe(true)
  })

  it('rejects different strings', () => {
    expect(constantTimeEqual('secret-value', 'secret-valuf')).toBe(false)
  })

  it('rejects different-length strings without throwing', () => {
    // timingSafeEqual throws on unequal buffer lengths; digesting first avoids
    // both the throw and the length side-channel.
    expect(() => constantTimeEqual('short', 'a-much-longer-value')).not.toThrow()
    expect(constantTimeEqual('short', 'a-much-longer-value')).toBe(false)
  })

  it('handles empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true)
    expect(constantTimeEqual('', 'x')).toBe(false)
  })
})
