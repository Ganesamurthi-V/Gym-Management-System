import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/exchange-code
 *
 * Exchanges a PKCE authorization code for a session.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * When Supabase is configured to use PKCE (the default for email confirmation
 * in newer projects), the verification link redirects to the app with a `?code=`
 * query parameter instead of fragment tokens (`#access_token=...`).
 *
 * The code must be exchanged server-side via `exchangeCodeForSession()`, which
 * validates the code with Supabase and writes the resulting session as HttpOnly
 * cookies via the SSR cookie adapter.
 *
 * This is called by /auth/setup-password when it detects a `?code=` param in
 * the URL, and by any other page that receives a PKCE redirect.
 *
 * Body: { code: string }
 * Success: { success: true, userId: string, email: string | null }
 * Failure: { error: string, code?: string }
 */
export async function POST(req: NextRequest) {
  try {
    let body: { code?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const code = body.code

    if (typeof code !== 'string' || code.length === 0 || code.length > 512) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data?.user) {
      console.error('[auth/exchange-code] exchange failed:', error?.message ?? 'no user')

      // Determine if this is an expiry/consumed issue vs a genuine error
      const msg = error?.message?.toLowerCase() ?? ''
      const isExpired = msg.includes('expired') || msg.includes('invalid') || msg.includes('used')

      return NextResponse.json(
        {
          error: isExpired
            ? 'code_expired'
            : 'exchange_failed',
          message: isExpired
            ? 'This verification link has expired or was already used.'
            : 'Could not verify your email. Please try again.',
        },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    return NextResponse.json(
      {
        success: true,
        userId: data.user.id,
        email: data.user.email ?? null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[auth/exchange-code] unexpected error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
