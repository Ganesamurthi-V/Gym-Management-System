import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Loose JWT shape check — three dot-separated base64url segments. */
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

/** Generous cap; real Supabase tokens are well under this. */
const MAX_TOKEN_LENGTH = 4096

/**
 * POST /api/auth/set-session
 *
 * Exchanges a Supabase access/refresh token pair for an HttpOnly cookie session.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Magic-link style flows land on a page with the tokens in the URL *fragment*
 * (`#access_token=…&refresh_token=…`). A fragment is never sent to the server, so
 * only the page can read it. Previously the page then called
 * `supabase.auth.setSession(...)` using the browser SDK, which meant loading the
 * Supabase client and talking to `*.supabase.co` from the browser.
 *
 * Now the page forwards the pair here and the server calls `setSession`, so the
 * resulting session is written as HttpOnly cookies that page JavaScript cannot
 * read. That is a net improvement over the browser-managed session, on top of
 * removing the direct Supabase dependency.
 *
 * `setSession` validates the tokens with Supabase, so a forged or expired pair is
 * rejected here rather than trusted.
 *
 * Body: { access_token: string, refresh_token: string }
 * Success: { success: true, userId: string, email: string | null }
 * Failure: { error: string } with 400 (malformed) or 401 (rejected by Supabase)
 */
export async function POST(req: NextRequest) {
  // Reject cross-site form posts. A browser will not attach this header to a
  // simple cross-origin request without a preflight, so its presence means the
  // call came from our own JavaScript.
  if (req.headers.get('x-requested-with') !== 'XMLHttpRequest') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    let body: { access_token?: unknown; refresh_token?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const accessToken = body.access_token
    const refreshToken = body.refresh_token

    if (
      typeof accessToken !== 'string' ||
      typeof refreshToken !== 'string' ||
      accessToken.length === 0 ||
      refreshToken.length === 0 ||
      accessToken.length > MAX_TOKEN_LENGTH ||
      refreshToken.length > MAX_TOKEN_LENGTH ||
      !JWT_RE.test(accessToken)
    ) {
      return NextResponse.json({ error: 'Invalid session tokens' }, { status: 400 })
    }

    const supabase = await createClient()

    // setSession does not merely return an error for a token it cannot decode —
    // it throws (observed with a syntactically valid but bogus JWT). Catch here
    // so an expired or tampered activation link produces the 401 the caller
    // knows how to handle, rather than a 500.
    let data: Awaited<ReturnType<typeof supabase.auth.setSession>>['data'] | null = null
    let failed = false

    try {
      const result = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (result.error) failed = true
      data = result.data
    } catch {
      failed = true
    }

    if (failed || !data?.user) {
      // Expired or already-consumed link. Keep the provider wording out of the
      // response but preserve the distinction the caller needs.
      return NextResponse.json(
        { error: 'session_failed', code: 'SESSION_REJECTED' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    return NextResponse.json(
      { success: true, userId: data.user.id, email: data.user.email ?? null },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[auth/set-session] unexpected error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
