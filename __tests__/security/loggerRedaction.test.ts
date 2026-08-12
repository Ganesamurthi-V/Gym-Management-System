/**
 * Tests for log redaction (lib/logger.ts).
 *
 * The credential audit found the redaction list was missing `apikey`,
 * `service_role_key` and `cookie`. Reviewing the implementation surfaced two
 * further problems that these tests also lock down:
 *
 *   1. Matching was EXACT, so `refresh_token`, `supabase_access_token` and
 *      `serviceRoleKey` were logged in full.
 *   2. The function claimed to work "one level deep" but did not recurse at all,
 *      so `{ user: { password: 'x' } }` leaked.
 */

import { describe, it, expect } from 'vitest'
import { __redactForTests } from '@/lib/logger'

const { redact, isSensitiveKey } = __redactForTests

describe('isSensitiveKey — keys reported missing by the audit', () => {
  it('redacts apikey / api_key in any casing or variant', () => {
    for (const k of ['apikey', 'apiKey', 'API_KEY', 'api_key', 'groqApiKey', 'x-api-key']) {
      expect(isSensitiveKey(k), k).toBe(true)
    }
  })

  it('redacts service_role_key variants', () => {
    for (const k of ['service_role_key', 'SUPABASE_SERVICE_ROLE_KEY', 'serviceRoleKey']) {
      expect(isSensitiveKey(k), k).toBe(true)
    }
  })

  it('redacts cookie headers', () => {
    for (const k of ['cookie', 'Cookie', 'set-cookie', 'cookieHeader']) {
      expect(isSensitiveKey(k), k).toBe(true)
    }
  })
})

describe('isSensitiveKey — variants the old exact-match Set missed', () => {
  it('catches token variants beyond the literal names', () => {
    for (const k of [
      'refresh_token',
      'supabase_access_token',
      'idToken',
      'access_token',
      'verify_token',
      'qstash_token',
    ]) {
      expect(isSensitiveKey(k), k).toBe(true)
    }
  })

  it('catches secret, credential, signature, password and bearer variants', () => {
    for (const k of [
      'app_secret',
      'clientSecret',
      'ADMIN_PANEL_SECRET',
      'credentials',
      'x-hub-signature-256',
      'hubSignature',
      'passwd',
      'newPassword',
      'bearerToken',
      'private_key',
      'sessionId',
      'otp',
    ]) {
      expect(isSensitiveKey(k), k).toBe(true)
    }
  })

  it('still catches every key from the original redaction list', () => {
    for (const k of [
      'authorization',
      'access_token',
      'accesstoken',
      'token',
      'secret',
      'password',
      'app_secret',
      'verify_token',
      'x-hub-signature-256',
    ]) {
      expect(isSensitiveKey(k), k).toBe(true)
    }
  })
})

describe('isSensitiveKey — must NOT over-redact', () => {
  it('preserves length/count metadata about a secret', () => {
    // lib/whatsapp/verifyWebhook.ts logs these deliberately to debug mismatches
    // without revealing the token. A length is not a credential.
    for (const k of ['tokenLength', 'expectedLength', 'secretLength', 'tokenCount']) {
      expect(isSensitiveKey(k), k).toBe(false)
    }
  })

  it('preserves boolean predicates', () => {
    for (const k of ['hasToken', 'isAuthorized', 'wasAuthenticated', 'canAuthorize']) {
      expect(isSensitiveKey(k), k).toBe(false)
    }
  })

  it('preserves ordinary debug fields, including ones containing "key"', () => {
    for (const k of [
      'cacheKey',
      'keys',
      'requestId',
      'component',
      'gymId',
      'userId',
      'status',
      'durationMs',
      'route',
      'method',
      'path',
      'tokenType',
      'authMode',
    ]) {
      expect(isSensitiveKey(k), k).toBe(false)
    }
  })
})

describe('redact — nesting', () => {
  it('redacts secrets nested inside objects (previously leaked)', () => {
    const out = redact({
      user: { id: 'u1', password: 'hunter2' },
      meta: { deep: { access_token: 'abc123' } },
    })
    expect((out.user as any).password).toBe('[REDACTED]')
    expect((out.user as any).id).toBe('u1')
    expect(((out.meta as any).deep as any).access_token).toBe('[REDACTED]')
  })

  it('redacts secrets inside arrays of objects', () => {
    const out = redact({ items: [{ token: 't1' }, { token: 't2', name: 'ok' }] })
    const items = out.items as any[]
    expect(items[0].token).toBe('[REDACTED]')
    expect(items[1].token).toBe('[REDACTED]')
    expect(items[1].name).toBe('ok')
  })

  it('leaves non-sensitive top-level values untouched', () => {
    const out = redact({ requestId: 'abc', count: 3, ok: true, nothing: null })
    expect(out).toEqual({ requestId: 'abc', count: 3, ok: true, nothing: null })
  })

  it('survives circular references', () => {
    const node: Record<string, unknown> = { name: 'root', secret: 's' }
    node.self = node
    const out = redact(node)
    expect(out.secret).toBe('[REDACTED]')
    expect(out.self).toBe('[CIRCULAR]')
  })

  it('caps runaway depth instead of recursing forever', () => {
    // Build a chain deeper than MAX_REDACT_DEPTH (6)
    let deep: Record<string, unknown> = { bottom: true }
    for (let i = 0; i < 12; i++) deep = { next: deep }
    const out = redact(deep)
    expect(JSON.stringify(out)).toContain('[TRUNCATED]')
  })

  it('does not walk Error or Date internals', () => {
    const err = new Error('boom')
    const date = new Date('2026-01-01T00:00:00Z')
    const out = redact({ err, date })
    expect(out.err).toBe(err)
    expect(out.date).toBe(date)
  })

  it('is serialisable by JSON.stringify after redaction', () => {
    const node: Record<string, unknown> = { password: 'p' }
    node.loop = node
    expect(() => JSON.stringify(redact(node))).not.toThrow()
  })
})
