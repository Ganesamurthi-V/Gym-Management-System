import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/signout
 *
 * Server-side sign-out. Replaces `supabase.auth.signOut()` calls that used to
 * run in the browser via the Supabase JS SDK.
 *
 * Calling `signOut()` on the SSR client revokes the refresh token with Supabase
 * AND clears the `sb-*` auth cookies through the cookie adapter in
 * `lib/supabase/server.ts`, so no manual `Set-Cookie` juggling is needed here.
 *
 * Body (optional): { scope?: 'global' | 'local' | 'others' }
 *   - 'global' (default) revokes every session for the user
 *   - 'local' revokes only this device's session — used by the login page when
 *     it clears a stale/mismatched session before a fresh sign-in attempt
 *
 * Always returns 200. A failed sign-out must not strand the user on a page they
 * are trying to leave; the client redirects to /auth/login either way.
 */
export async function POST(req: NextRequest) {
  let scope: 'global' | 'local' | 'others' = 'global'

  try {
    const body = await req.json() as { scope?: unknown }
    if (body?.scope === 'local' || body?.scope === 'others' || body?.scope === 'global') {
      scope = body.scope
    }
  } catch {
    // No body / invalid JSON — keep the default global scope.
  }

  try {
    const supabase = await createClient()
    await supabase.auth.signOut({ scope })
  } catch {
    // Swallow: the cookies are cleared by the adapter regardless, and the caller
    // is navigating away. Surfacing a 500 here would only block the redirect.
  }

  return NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
