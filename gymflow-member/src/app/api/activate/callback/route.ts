/**
 * GET /api/activate/callback
 *
 * Supabase email verification redirect handler.
 *
 * When the member clicks "Verify Email" in the confirmation email, Supabase
 * redirects to this URL with auth tokens in the hash/params. This route:
 *
 *  1. Exchanges the code for a session (verifies the email)
 *  2. Looks up the member via auth_user_id
 *  3. Completes activation: invitation_status='activated', portal_activated_at=NOW()
 *  4. Clears the invitation token (single-use)
 *  5. Logs portal_activated activity
 *  6. Redirects to /activate/success
 *
 * Supabase Auth settings must configure the email confirmation redirect URL to:
 *   https://member.gymflow.sbs/api/activate/callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing service role configuration')
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  const redirectUrl = req.nextUrl.clone()
  redirectUrl.pathname = '/activate/success'
  redirectUrl.search = ''

  const errorUrl = req.nextUrl.clone()
  errorUrl.pathname = '/activate/error'
  errorUrl.search = ''

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
            // Route handler context
          }
        },
      },
    })

    // Exchange the auth code or verify token_hash
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('[activate/callback] code exchange failed:', error.message)
        return NextResponse.redirect(errorUrl)
      }
    } else if (tokenHash && type === 'email') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email',
      })
      if (error) {
        console.error('[activate/callback] OTP verify failed:', error.message)
        return NextResponse.redirect(errorUrl)
      }
    } else {
      return NextResponse.redirect(errorUrl)
    }

    // Get the now-authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(errorUrl)
    }

    const memberId = user.user_metadata?.member_id
    const gymId = user.user_metadata?.gym_id

    if (!memberId || !gymId) {
      return NextResponse.redirect(redirectUrl) // Still show success, account is verified
    }

    // Use service-role to complete the activation
    const serviceSupabase = getServiceSupabase()

    // Mark invitation as used — clear token, set activation step complete
    await serviceSupabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        invitation_token: null, // Single-use: clear it
        activation_step: 'completed',
        activated_at: new Date().toISOString(),
      },
    })

    // Update member row: fully activated
    await serviceSupabase
      .from('members')
      .update({
        invitation_status: 'activated',
        portal_activated_at: new Date().toISOString(),
        portal_enabled: true,
      })
      .eq('id', memberId)
      .eq('gym_id', gymId)

    // Log activity
    await serviceSupabase.from('member_portal_activity').insert({
      gym_id: gymId,
      member_id: memberId,
      activity: 'portal_activated',
      performed_by: 'member',
    })

    return NextResponse.redirect(redirectUrl)
  } catch (err) {
    console.error('[activate/callback] error:', err)
    return NextResponse.redirect(errorUrl)
  }
}
