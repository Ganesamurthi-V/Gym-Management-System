/**
 * GET /api/activate/callback
 *
 * Supabase redirects here after the member opens the verification link.
 *
 * ── What actually arrives here ───────────────────────────────────────────────
 * Verified against the live project: Supabase's /auth/v1/verify responds 303 to
 *
 *     https://member.gymflow.sbs/api/activate/callback#access_token=...
 *
 * The tokens are in the URL **fragment**, which is never sent to the server. So
 * on the normal path this route has nothing to read and must hand off to a
 * client page that can see `window.location.hash`.
 *
 * Failures arrive the same way: `#error=access_denied&error_code=otp_expired`.
 *
 * This route therefore only handles the query-param flows (`code` /
 * `token_hash`, used if the project is switched to PKCE or a custom template)
 * and otherwise forwards to /activate/verifying, which reads the fragment.
 *
 * It used to forward to /activate/error on every fragment-based sign-in, so a
 * completely successful activation showed a URL that said "error". It also
 * redirected to /activate/success when the auth user had no member linkage,
 * reporting success for an activation that never happened.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getServiceSupabase } from '@/lib/activation-token'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const errorDescription = searchParams.get('error_description')
  const errorCode = searchParams.get('error_code')

  const baseUrl = req.nextUrl.origin
  const successUrl = `${baseUrl}/activate/success`
  const verifyingUrl = `${baseUrl}/activate/verifying`

  const failUrl = (reason: string) =>
    `${baseUrl}/activate/verifying?failed=${encodeURIComponent(reason)}`

  // Supabase reported the failure as query params (non-fragment templates).
  if (errorDescription || errorCode) {
    console.error('[activate/callback] Supabase error:', errorCode, errorDescription)
    return NextResponse.redirect(failUrl(errorCode ?? 'verification_failed'))
  }

  // Nothing readable server-side → the tokens (or the error) are in the
  // fragment. Forward to the client page, which can read it. The browser
  // carries the original fragment across this redirect.
  if (!code && !tokenHash) {
    return NextResponse.redirect(verifyingUrl)
  }

  try {
    const url = process.env.SUPABASE_URL!
    const anonKey = process.env.SUPABASE_ANON_KEY!
    const cookieStore = await cookies()

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Not writable in some route-handler contexts.
          }
        },
      },
    })

    let user = null

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('[activate/callback] code exchange failed:', error.message)
        return NextResponse.redirect(failUrl('exchange_failed'))
      }
      user = data.user
    }

    if (!user && tokenHash) {
      const verifyType = (type === 'magiclink' || type === 'email') ? type : 'magiclink'
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: verifyType as 'magiclink' | 'email',
      })
      if (error) {
        console.error(`[activate/callback] verifyOtp failed (${verifyType}):`, error.message)
        return NextResponse.redirect(failUrl(error.message.includes('expired') ? 'otp_expired' : 'verify_failed'))
      }
      user = data.user
    }

    if (!user) {
      return NextResponse.redirect(failUrl('no_session'))
    }

    const memberId = user.user_metadata?.member_id
    const gymId = user.user_metadata?.gym_id

    // Previously this fell through to the success page when the linkage was
    // missing, so the member saw "Account Activated!" while nothing was written.
    if (!memberId || !gymId) {
      console.error('[activate/callback] auth user has no member linkage', { userId: user.id })
      return NextResponse.redirect(failUrl('no_member_linkage'))
    }

    const service = getServiceSupabase()

    await service.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        invitation_token: null,
        activation_step: 'completed',
        activated_at: new Date().toISOString(),
      },
    })

    const { error: memberErr } = await service
      .from('members')
      .update({
        invitation_status: 'activated',
        portal_activated_at: new Date().toISOString(),
        portal_enabled: true,
      })
      .eq('id', memberId)
      .eq('gym_id', gymId)

    if (memberErr) {
      console.error('[activate/callback] member update failed:', memberErr.message)
      return NextResponse.redirect(failUrl('activation_write_failed'))
    }

    await service.from('member_portal_activity').insert({
      gym_id: gymId,
      member_id: memberId,
      activity: 'portal_activated',
      performed_by: 'member',
    })

    return NextResponse.redirect(successUrl)
  } catch (err) {
    console.error('[activate/callback] error:', err)
    return NextResponse.redirect(failUrl('unexpected_error'))
  }
}
