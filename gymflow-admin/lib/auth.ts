import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const COOKIE_NAME = 'gymflow_admin_session'
const SESSION_DURATION = 60 * 60 * 8 // 8 hours (web cookie)
const MOBILE_SESSION_DURATION = 60 * 60 * 24 * 30 // 30 days (mobile Bearer token)

const ISSUER = 'gymflow-admin'
export type AdminAudience = 'admin-web' | 'admin-mobile'

let cachedKey: Uint8Array | null = null

// The login password (ADMIN_PANEL_SECRET) must not also be the signing key:
// anyone who learns one would get the other. Use ADMIN_JWT_SECRET; if an old
// deploy has not set it yet, derive a distinct key from the panel secret so
// nothing breaks, and warn.
async function getKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey
  const jwtSecret = process.env.ADMIN_JWT_SECRET
  if (jwtSecret) {
    cachedKey = new TextEncoder().encode(jwtSecret)
    return cachedKey
  }
  const panel = process.env.ADMIN_PANEL_SECRET
  if (!panel) throw new Error('Missing ADMIN_PANEL_SECRET')
  console.warn('ADMIN_JWT_SECRET is not set; deriving the session key from ADMIN_PANEL_SECRET. Set ADMIN_JWT_SECRET.')
  const enc = new TextEncoder()
  const hmacKey = await crypto.subtle.importKey('raw', enc.encode(panel), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  cachedKey = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode('gymflow-admin-session-key-v1')))
  return cachedKey
}

// Bumping ADMIN_SESSION_VERSION invalidates every issued token (all devices).
function sessionVersion(): string {
  return process.env.ADMIN_SESSION_VERSION || '1'
}

export async function createAdminSession(aud: AdminAudience = 'admin-web'): Promise<string> {
  const duration = aud === 'admin-mobile' ? MOBILE_SESSION_DURATION : SESSION_DURATION
  return new SignJWT({ role: 'super_admin', ver: sessionVersion() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(`${duration}s`)
    .sign(await getKey())
}

export async function verifyAdminSession(token: string, aud: AdminAudience = 'admin-web'): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, await getKey(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: aud,
    })
    return payload.role === 'super_admin' && payload.ver === sessionVersion()
  } catch {
    return false
  }
}

export async function getAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return false
    return verifyAdminSession(token)
  } catch {
    return false
  }
}

// Shared by middleware and verifyRequestAuth so they cannot drift.
export function bearerToken(headers: Headers): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(headers.get('Authorization') ?? '')
  return m ? m[1] : null
}

export async function verifyRequestAuth(req: NextRequest): Promise<boolean> {
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value
  if (cookieToken && await verifyAdminSession(cookieToken)) return true

  // Mobile app: a signed, expiring, revocable JWT. The raw admin password is
  // no longer accepted as a Bearer token.
  const bearer = bearerToken(req.headers)
  return !!bearer && verifyAdminSession(bearer, 'admin-mobile')
}

export { COOKIE_NAME, SESSION_DURATION, MOBILE_SESSION_DURATION }
