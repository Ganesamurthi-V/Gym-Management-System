/**
 * POST /api/activate/complete
 *
 * Step 1 of activation — member submits email + password:
 *  1. Validates invitation token (exists, not expired, not used)
 *  2. Validates form (email unique, password policy)
 *  3. Updates the Auth user with the chosen email + password
 *  4. Sets email_confirm = false so Supabase sends a verification email
 *  5. Stores pending activation metadata
 *
 * The account is NOT yet active. The member must click the email verification
 * link, which triggers the Supabase auth callback → /activate/success.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY — public endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing service role configuration')
  return createClient(url, key)
}

const TOKEN_EXPIRY_HOURS = 24

export async function POST(req: NextRequest) {
  try {
    let body: { token: string; email: string; password: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const { token, email, password } = body

    // ── Input validation ──────────────────────────────────────────────────────
    if (!token || token.length < 20) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
    }
    const trimmedEmail = email?.trim().toLowerCase()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address' }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    if (!/\d/.test(password)) {
      return NextResponse.json({ success: false, error: 'Password must contain at least one number' }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    // ── Find auth user by token ───────────────────────────────────────────────
    const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    })

    if (listErr || !usersData) {
      return NextResponse.json({ success: false, error: 'Unable to verify token' }, { status: 500 })
    }

    const authUser = usersData.users.find(
      u => u.user_metadata?.invitation_token === token
    )

    if (!authUser) {
      return NextResponse.json({
        success: false,
        error: 'This invitation link is invalid or has already been used.',
      }, { status: 404 })
    }

    // ── Check expiry ──────────────────────────────────────────────────────────
    const invitedAt = authUser.user_metadata?.invited_at
    if (invitedAt) {
      const elapsed = Date.now() - new Date(invitedAt).getTime()
      if (elapsed > TOKEN_EXPIRY_HOURS * 60 * 60 * 1000) {
        return NextResponse.json({
          success: false,
          error: 'This invitation link has expired. Please ask your gym to send a new one.',
        }, { status: 410 })
      }
    }

    const memberId = authUser.user_metadata?.member_id
    const gymId = authUser.user_metadata?.gym_id
    if (!memberId || !gymId) {
      return NextResponse.json({ success: false, error: 'Incomplete invitation data' }, { status: 400 })
    }

    // ── Check email uniqueness ────────────────────────────────────────────────
    const existingUser = usersData.users.find(
      u => u.email === trimmedEmail && u.id !== authUser.id
    )
    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: 'This email is already in use. Please choose a different one.',
      }, { status: 409 })
    }

    // ── Update Auth user — set email + password, DON'T confirm email ──────────
    // Setting email_confirm: false means Supabase will send the confirmation
    // email automatically when the email is changed.
    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      email: trimmedEmail,
      password,
      email_confirm: false, // Triggers verification email from Supabase
      user_metadata: {
        ...authUser.user_metadata,
        pending_email: trimmedEmail,
        activation_step: 'email_verification_pending',
      },
    })

    if (updateErr) {
      console.error('[activate/complete] auth update failed:', updateErr.message)
      if (updateErr.message.includes('already been registered')) {
        return NextResponse.json({
          success: false,
          error: 'This email is already registered. Please use a different one.',
        }, { status: 409 })
      }
      return NextResponse.json({
        success: false,
        error: 'Failed to set up your account. Please try again.',
      }, { status: 500 })
    }

    // ── Store email on member row (pending state) ─────────────────────────────
    await supabase
      .from('members')
      .update({
        email: trimmedEmail,
        invitation_status: 'delivered', // Intermediate: email sent, awaiting verification
      })
      .eq('id', memberId)
      .eq('gym_id', gymId)

    return NextResponse.json({
      success: true,
      message: 'Verification email sent. Please check your inbox and click the verification link.',
    })
  } catch (err) {
    console.error('[activate/complete] error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
