/**
 * GET /api/activate/callback
 *
 * Supabase magic link redirect handler.
 *
 * When the member clicks "Activate Account" in the magic link email, Supabase
 * redirects here with one of:
 *   - ?code=xxx (PKCE flow)
 *   - ?token_hash=xxx&type=magiclink (implicit/token-hash flow)
 *   - ?token_hash=xxx&type=email (email OTP flow)
 *
 * This route exchanges the token for a session, completes the activation,
 * and redirects to /activate/success.
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
            // Route handler context — cookies may not be writable
          }
        },
      },
    })

    let verified = false

    // Method 1: PKCE code exchange
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('[activate/callback] code exchange failed:', error.message)
        return NextResponse.redirect(errorUrl)
      }
      verified = true
    }

    // Method 2: token_hash verification (handles both 'magiclink' and 'email' types)
    if (!verified && tokenHash) {
      // Supabase sends type=magiclink for magic links, type=email for email OTP
      const otpType = type === 'email' ? 'email' : 'magiclink'
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      })
      if (error) {
        console.error(`[activate/callback] OTP verify failed (type=${otpType}):`, error.message)
        return NextResponse.redirect(errorUrl)
      }
      verified = true
    }

    if (!verified) {
      console.error('[activate/callback] no code or token_hash in URL')
      return NextResponse.redirect(errorUrl)
    }

    // Get the now-authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('[activate/callback] no user after verification')
      return NextResponse.redirect(errorUrl)
    }

    const memberId = user.user_metadata?.member_id
    const gymId = user.user_metadata?.gym_id

    if (!memberId || !gymId) {
      // Account verified but no member linkage — still show success
      return NextResponse.redirect(redirectUrl)
    }

    // Use service-role to complete the activation
    const serviceSupabase = getServiceSupabase()

    // Clear invitation token (single-use) and mark step complete
    await serviceSupabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        invitation_token: null,
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
