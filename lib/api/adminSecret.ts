import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Pure, dependency-free decision logic for platform-admin bearer auth.
 *
 * Kept separate from `lib/api/adminAuth.ts` (which is `server-only` and owns the
 * Redis rate limiter) so the security-critical decisions can be unit tested
 * directly, with no network or environment setup.
 */

/** Minimum acceptable length for ADMIN_PASSWORD. Shorter → treated as unset. */
export const MIN_ADMIN_SECRET_LENGTH = 16

export type AdminAuthVerdict =
  /** ADMIN_PASSWORD missing or too short — the route must fail closed (503). */
  | { verdict: 'misconfigured'; reason: string }
  /** No usable bearer token on the request (401). */
  | { verdict: 'missing_token' }
  /** Token present but wrong (401). */
  | { verdict: 'invalid_token' }
  /** Token matches (proceed). */
  | { verdict: 'ok' }

/**
 * Constant-time string equality.
 *
 * Both inputs are reduced to fixed-width SHA-256 digests before comparison, so
 * `timingSafeEqual` never sees unequal lengths (it throws on that, and
 * branching around it would leak the secret's length).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest()
  const digestB = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(digestA, digestB)
}

/**
 * Extract a bearer token from an Authorization header value.
 * Returns null unless the scheme is exactly `Bearer` and the token is non-empty.
 */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null
  const [scheme, ...rest] = authorizationHeader.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null
  const token = rest.join(' ').trim()
  return token.length > 0 ? token : null
}

/**
 * Decide whether a request is authorized as platform admin.
 *
 * This replaces the previous inline pattern:
 *
 *     if (token !== process.env.ADMIN_PASSWORD) return 401
 *
 * which granted access when BOTH sides were `undefined` (secret not configured
 * AND no header sent), because `undefined !== undefined` is false.
 *
 * Every ambiguous input now resolves to a denial.
 */
export function decideAdminAuth(
  authorizationHeader: string | null | undefined,
  configuredSecret: string | null | undefined
): AdminAuthVerdict {
  // 1. Secret must be configured and of meaningful length. Checked FIRST so a
  //    missing secret can never be satisfied by a missing token.
  if (!configuredSecret || configuredSecret.trim().length === 0) {
    return { verdict: 'misconfigured', reason: 'ADMIN_PASSWORD is not set' }
  }
  if (configuredSecret.trim().length < MIN_ADMIN_SECRET_LENGTH) {
    return {
      verdict: 'misconfigured',
      reason: `ADMIN_PASSWORD shorter than ${MIN_ADMIN_SECRET_LENGTH} characters`,
    }
  }

  // 2. A real bearer token must be present.
  const token = extractBearerToken(authorizationHeader)
  if (token === null) return { verdict: 'missing_token' }

  // 3. Constant-time comparison.
  return constantTimeEqual(token, configuredSecret)
    ? { verdict: 'ok' }
    : { verdict: 'invalid_token' }
}
