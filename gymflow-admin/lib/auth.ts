import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const COOKIE_NAME = 'gymflow_admin_session'
const SESSION_DURATION = 60 * 60 * 8 // 8 hours

function getSecret() {
  const secret = process.env.ADMIN_PANEL_SECRET
  if (!secret) throw new Error('Missing ADMIN_PANEL_SECRET')
  return new TextEncoder().encode(secret)
}

export async function createAdminSession(): Promise<string> {
  const token = await new SignJWT({ role: 'super_admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSecret())
  return token
}

export async function verifyAdminSession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret())
    return true
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

export async function verifyRequestAuth(req: NextRequest): Promise<boolean> {
  // Check cookie
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value
  if (cookieToken && await verifyAdminSession(cookieToken)) return true

  // Check bearer token for API-to-API calls
  const bearer = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (bearer === process.env.ADMIN_PANEL_SECRET) return true

  return false
}

export { COOKIE_NAME, SESSION_DURATION }
