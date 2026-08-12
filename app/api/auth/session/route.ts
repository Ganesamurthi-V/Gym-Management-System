import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { roleFromClaims, type AppRole } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

type SessionResponse = {
  authenticated: boolean
  userId: string | null
  email: string | null
  role: AppRole | null
  /** ISO timestamp, or null when the address is still unverified. */
  emailConfirmedAt: string | null
  name: string | null
}

const ANONYMOUS: SessionResponse = {
  authenticated: false,
  userId: null,
  email: null,
  role: null,
  emailConfirmedAt: null,
  name: null,
}

/** Private data — must never be cached by the CDN or shared between users. */
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

/**
 * GET /api/auth/session
 *
 * Reports who the caller is, based solely on the HttpOnly session cookie.
 * Replaces the browser-side `supabase.auth.getUser()` / `getSession()` /
 * `getClaims()` calls, which required shipping the Supabase client and hitting
 * `*.supabase.co` directly from the page.
 *
 * Returns 200 with `authenticated: false` rather than 401 when there is no
 * session. Callers here are guards and menus asking "is anyone signed in?" —
 * for them, "nobody" is a normal answer, not an error, and a 200 keeps it out
 * of the browser console as a failed request.
 *
 * Uses `getUser()`, not `getSession()`: `getUser()` revalidates the token
 * against Supabase, so a revoked or expired session is reported as signed out.
 * `getSession()` would trust whatever the cookie claims.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json(ANONYMOUS, { headers: NO_STORE })
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>

    const payload: SessionResponse = {
      authenticated: true,
      userId: user.id,
      email: user.email ?? null,
      role: roleFromClaims({ user_metadata: user.user_metadata, app_metadata: user.app_metadata }),
      emailConfirmedAt: user.email_confirmed_at ?? null,
      name: typeof meta.name === 'string' ? meta.name : null,
    }

    return NextResponse.json(payload, { headers: NO_STORE })
  } catch {
    // Treat an unexpected failure as "not signed in" so guards fail closed.
    return NextResponse.json(ANONYMOUS, { headers: NO_STORE })
  }
}
