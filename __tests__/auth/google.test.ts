import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createHash } from 'crypto'
import { SignJWT, generateKeyPair, type KeyLike } from 'jose'

vi.mock('server-only', () => ({}))

import {
  buildGoogleAuthorizeUrl,
  codeChallengeS256,
  decideGoogleSignIn,
  verifyGoogleIdToken,
} from '@/lib/auth/google'

const CLIENT_ID = 'test-client.apps.googleusercontent.com'

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
})

describe('decideGoogleSignIn', () => {
  const cases: Array<[boolean, boolean, boolean, string]> = [
    [false, false, false, 'create_owner'],
    [false, false, true, 'create_owner'],
    [true, false, false, 'sign_in_existing'],
    [true, false, true, 'sign_in_existing'],
    [true, true, false, 'reject_member'],
    [true, true, true, 'reject_member'],
    [false, true, false, 'reject_member'],
  ]
  it.each(cases)('existing=%s member=%s gym=%s -> %s', (existingUser, isMember, hasGym, expected) => {
    expect(decideGoogleSignIn({ existingUser, isMember, hasGym })).toBe(expected)
  })
})

describe('PKCE and authorize URL', () => {
  it('challenge is base64url(sha256(verifier))', () => {
    const v = 'abc-verifier_123'
    expect(codeChallengeS256(v)).toBe(createHash('sha256').update(v).digest('base64url'))
  })

  it('carries every required parameter', () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({ state: 's1', nonce: 'n1', codeChallenge: 'c1', redirectUri: 'http://localhost:3004/cb' }),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const q = url.searchParams
    expect(q.get('client_id')).toBe(CLIENT_ID)
    expect(q.get('response_type')).toBe('code')
    expect(q.get('scope')).toBe('openid email profile')
    expect(q.get('state')).toBe('s1')
    expect(q.get('nonce')).toBe('n1')
    expect(q.get('code_challenge')).toBe('c1')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('redirect_uri')).toBe('http://localhost:3004/cb')
    expect(q.get('prompt')).toBe('select_account')
  })
})

describe('verifyGoogleIdToken', () => {
  let privateKey: KeyLike
  let publicKey: KeyLike

  beforeAll(async () => {
    ;({ privateKey, publicKey } = await generateKeyPair('RS256'))
  })

  const sign = (claims: Record<string, unknown>, o: { iss?: string; aud?: string; exp?: string | number } = {}) =>
    new SignJWT({ nonce: 'n1', email: 'Owner@Example.com', email_verified: true, name: 'Owner', ...claims })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(o.iss ?? 'https://accounts.google.com')
      .setAudience(o.aud ?? CLIENT_ID)
      .setSubject('sub-1')
      .setIssuedAt()
      .setExpirationTime(o.exp ?? '10m')
      .sign(privateKey)

  const verify = (jwt: string, nonce = 'n1') => verifyGoogleIdToken(jwt, { nonce, key: publicKey })

  it('accepts a valid token and lowercases the email', async () => {
    expect(await verify(await sign({}))).toEqual({ email: 'owner@example.com', name: 'Owner', sub: 'sub-1' })
  })
  it('accepts the bare accounts.google.com issuer', async () => {
    await expect(verify(await sign({}, { iss: 'accounts.google.com' }))).resolves.toBeTruthy()
  })
  it('rejects a bad audience', async () => {
    await expect(verify(await sign({}, { aud: 'other-client' }))).rejects.toThrow()
  })
  it('rejects a bad issuer', async () => {
    await expect(verify(await sign({}, { iss: 'https://evil.example.com' }))).rejects.toThrow()
  })
  it('rejects an expired token', async () => {
    await expect(verify(await sign({}, { exp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toThrow()
  })
  it('rejects a nonce mismatch', async () => {
    await expect(verify(await sign({}), 'different')).rejects.toThrow(/nonce/)
  })
  it('rejects an unverified email', async () => {
    await expect(verify(await sign({ email_verified: false }))).rejects.toThrow(/verified/)
  })
  it('rejects a missing email', async () => {
    await expect(verify(await sign({ email: undefined }))).rejects.toThrow(/email/)
  })
})
