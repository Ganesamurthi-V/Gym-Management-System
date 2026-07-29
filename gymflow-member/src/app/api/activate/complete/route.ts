/**
 * POST /api/activate/complete
 *
 * Completes member portal activation:
 * 1. Validates the invitation token
 * 2. Updates the Auth user's email and password
 * 3. Clears the invitation token (single-use)
 * 4. Updates the member row: invitation_status='activated', portal_activated_at=now()
 * 5. Logs the portal_activated activity
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY — this is a public endpoint (member isn't logged in yet).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing service role configuration')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    let body: { token: string; email: string; password: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const { token, email, password } = body

    // Validate inputs
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

    // Find the auth user with this token
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
        error: 'This activation link is invalid or has already been used.',
      }, { status: 404 })
    }

    const memberId = authUser.user_metadata?.member_id
    const gymId = authUser.user_metadata?.gym_id

    if (!memberId || !gymId) {
      return NextResponse.json({ success: false, error: 'Incomplete invitation data' }, { status: 400 })
    }

    // Check if email is already taken by another user
    const existingUser = usersData.users.find(
      u => u.email === trimmedEmail && u.id !== authUser.id
    )
    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: 'This email is already in use. Please choose a different one.',
      }, { status: 409 })
    }

    // Update the Auth user: set email, password, confirm email, and clear token
    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      email: trimmedEmail,
      password,
      email_confirm: true, // Auto-confirm since they activated via secure link
      user_metadata: {
        ...authUser.user_metadata,
        invitation_token: null, // Single-use: clear the token
        activated_at: new Date().toISOString(),
      },
    })

    if (updateErr) {
      console.error('[activate/complete] auth update failed:', updateErr.message)
      return NextResponse.json({
        success: false,
        error: updateErr.message.includes('already been registered')
          ? 'This email is already in use.'
          : 'Failed to set up your account. Please try again.',
      }, { status: 500 })
    }

    // Update member row: mark as activated, store email
    const { error: memberErr } = await supabase
      .from('members')
      .update({
        invitation_status: 'activated',
        portal_activated_at: new Date().toISOString(),
        last_portal_login: null,
        email: trimmedEmail,
      })
      .eq('id', memberId)
      .eq('gym_id', gymId)

    if (memberErr) {
      console.error('[activate/complete] member update failed:', memberErr.message)
      // Non-fatal — the auth account is already set up
    }

    // Log activity
    await supabase.from('member_portal_activity').insert({
      gym_id: gymId,
      member_id: memberId,
      activity: 'portal_activated',
      performed_by: 'member',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[activate/complete] error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
