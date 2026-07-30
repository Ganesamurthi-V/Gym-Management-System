/**
 * GET /api/activate/callback
 *
 * Supabase redirects here after the member clicks the magic link.
 * The actual token verification happens at Supabase's /auth/v1/verify endpoint
 * BEFORE redirecting here. By the time this route is hit, the user already has
 * a valid session via cookies. We just need to read it and complete activation.
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
  const errorDescription = searchParams.get('error_description')

  const baseUrl = req.nextUrl.origin
  const successUrl = `${baseUrl}/activate/success`
  const errorUrl = `${baseUrl}/activate/error`

  // If Supabase sent an error param, redirect to error page
  if (errorDescription) {
    console.error('[activate/callback] Supabase error:', errorDescription)
    return NextResponse.redirect(errorUrl)
  }

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
            // May not be writable in route handler
          }
        },
      },
    })

    let user = null

    // Try code exchange (PKCE flow)
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('[activate/callback] code exchange failed:', error.message)
        return NextResponse.redirect(errorUrl)
      }
      user = data.user
    }

    // Try token_hash verification (magic link / email OTP)
    if (!user && tokenHash) {
      const verifyType = (type === 'magiclink' || type === 'email') ? type : 'magiclink'
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: verifyType as 'magiclink' | 'email',
      })
      if (error) {
        console.error(`[activate/callback] verifyOtp failed (${verifyType}):`, error.message)
        return NextResponse.redirect(errorUrl)
      }
      user = data.user
    }

    // If no code/token_hash, try reading existing session (Supabase may have
    // already set cookies during the /auth/v1/verify redirect chain)
    if (!user) {
      const { data: { user: sessionUser } } = await supabase.auth.getUser()
      user = sessionUser
    }

    if (!user) {
      console.error('[activate/callback] no user found after all verification attempts')
      return NextResponse.redirect(errorUrl)
    }

    // Complete activation
    const memberId = user.user_metadata?.member_id
    const gymId = user.user_metadata?.gym_id

    if (memberId && gymId) {
      const serviceSupabase = getServiceSupabase()

      // Confirm the email now that the magic link was clicked
      await serviceSupabase.auth.admin.updateUserById(user.id, {
        email_confirm: true,
        user_metadata: {
          ...user.user_metadata,
          invitation_token: null,
          activation_step: 'completed',
          activated_at: new Date().toISOString(),
        },
      })

      await serviceSupabase
        .from('members')
        .update({
          invitation_status: 'activated',
          portal_activated_at: new Date().toISOString(),
          portal_enabled: true,
        })
        .eq('id', memberId)
        .eq('gym_id', gymId)

      await serviceSupabase.from('member_portal_activity').insert({
        gym_id: gymId,
        member_id: memberId,
        activity: 'portal_activated',
        performed_by: 'member',
      })
    }

    return NextResponse.redirect(successUrl)
  } catch (err) {
    console.error('[activate/callback] error:', err)
    return NextResponse.redirect(errorUrl)
  }
}
