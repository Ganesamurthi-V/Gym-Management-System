import 'server-only'

import { createHash, randomBytes } from 'crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyLike } from 'jose'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

export class GoogleConfigError extends Error {}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

function clientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new GoogleConfigError('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set')
  return { clientId, clientSecret }
}

const b64url = (buf: Buffer) => buf.toString('base64url')

/** Unguessable value for `state` / `nonce`. */
export function randomToken(): string {
  return b64url(randomBytes(32))
}

export function generateCodeVerifier(): string {
  return b64url(randomBytes(48))
}

/** RFC 7636 S256: base64url(sha256(verifier)). */
export function codeChallengeS256(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest())
}

export function buildGoogleAuthorizeUrl(p: {
  state: string
  nonce: string
  codeChallenge: string
  redirectUri: string
}): string {
  const { clientId } = clientCredentials()
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return url.toString()
}

/** Exchanges the authorization code (server to server) and returns the raw ID token. */
export async function exchangeGoogleCode(p: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<string> {
  const { clientId, clientSecret } = clientCredentials()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: p.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: p.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: p.codeVerifier,
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`)
  const json = (await res.json()) as { id_token?: unknown }
  if (typeof json.id_token !== 'string') throw new Error('Google token response had no id_token')
  return json.id_token
}

let remoteJwks: JWTVerifyGetKey | null = null

/**
 * `key` exists so tests can verify against a local key without network.
 * Production callers omit it and get Google's published JWKS.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { nonce: string; key?: KeyLike | Uint8Array | JWTVerifyGetKey },
): Promise<{ email: string; name: string | null; sub: string }> {
  const { clientId } = clientCredentials()
  remoteJwks ??= createRemoteJWKSet(new URL(JWKS_URL))
  const key = opts.key ?? remoteJwks

  const options = { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId }
  const { payload } = await (typeof key === 'function'
    ? jwtVerify(idToken, key, options)
    : jwtVerify(idToken, key, options))

  // jwtVerify enforces exp when present; Google always sends it, so require it.
  if (typeof payload.exp !== 'number') throw new Error('ID token has no exp')
  if (payload.nonce !== opts.nonce) throw new Error('ID token nonce mismatch')
  // An unverified Google email must never be allowed to claim an existing account.
  if (payload.email_verified !== true) throw new Error('Google email is not verified')
  if (typeof payload.email !== 'string' || !payload.email) throw new Error('ID token has no email')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('ID token has no sub')

  return {
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null,
    sub: payload.sub,
  }
}

export type GoogleSignInDecision = 'reject_member' | 'sign_in_existing' | 'create_owner'

/** Members never get an owner session through Google, even if they share an email with one. */
export function decideGoogleSignIn(p: {
  existingUser: boolean
  isMember: boolean
  hasGym: boolean
}): GoogleSignInDecision {
  if (p.isMember) return 'reject_member'
  return p.existingUser ? 'sign_in_existing' : 'create_owner'
}
