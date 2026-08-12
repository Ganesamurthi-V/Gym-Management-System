import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validatePasswordStrength } from '@/lib/auth/password'

export const dynamic = 'force-dynamic'

/** No auth response — success or failure — may be cached or shared. */
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

function fail(status: number, error: string, code?: string) {
  return NextResponse.json(
    code ? { error, code } : { error },
    { status, headers: NO_STORE },
  )
}

/**
 * POST /api/auth/update-password
 *
 * Sets the password for the currently signed-in user. Replaces the browser-side
 * `supabase.auth.updateUser({ password })` calls on /auth/setup-password and the
 * owner account page.
 *
 * Authorization comes entirely from the session cookie — the endpoint updates
 * "whoever you are" and accepts no user id from the client, so it cannot be
 * pointed at another account.
 *
 * Body: { password: string }
 * Success: { success: true }
 * Failure: { error: string, code?: string }  (400 invalid, 401 no session)
 */
export async function POST(req: NextRequest) {
  try {
    let body: { password?: unknown }
    try {
      body = await req.json()
    } catch {
      return fail(400, 'Invalid request body')
    }

    const { password } = body

    if (typeof password !== 'string' || password.length === 0) {
      return fail(400, 'Password is required')
    }

    const weakness = validatePasswordStrength(password)
    if (weakness) {
      return fail(400, weakness)
    }

    const supabase = await createClient()

    // Confirm there is a real, still-valid session before attempting the write.
    // getUser() revalidates with Supabase, so a revoked token is rejected here
    // rather than producing a confusing error from updateUser.
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return fail(
        401,
        'Your session has expired. Please use the link in your email again, or sign in.',
        'NO_SESSION',
      )
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      // Map the handful of Supabase messages the UI used to special-case, so the
      // wording the user sees does not regress. Anything else gets a generic
      // message — raw provider errors are logged, not returned.
      const raw = updateError.message ?? ''

      if (/same.*password/i.test(raw)) {
        return fail(400, 'Please choose a different password than the temporary one.', 'SAME_PASSWORD')
      }

      if (/sub claim in JWT does not exist/i.test(raw)) {
        return fail(
          401,
          'Your session is no longer valid. Please return to the sign up page and try again.',
          'INVALID_SESSION',
        )
      }

      console.error('[auth/update-password] updateUser failed:', raw)
      return fail(400, 'Could not update your password. Please try again.')
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (err) {
    console.error('[auth/update-password] unexpected error:', err)
    return fail(500, 'An unexpected error occurred')
  }
}
