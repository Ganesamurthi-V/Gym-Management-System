/**
 * POST /api/activate/verify
 *
 * Validates an invitation token and returns the member's display info.
 * Public endpoint — the member hasn't logged in yet.
 *
 * Checks:
 *  ✔ Token exists in auth user metadata
 *  ✔ Token not expired (24h from invited_at)
 *  ✔ Token not already used (invitation_token is not null)
 *  ✔ Member exists with portal_status = pending
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
    let body: { token: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const { token } = body
    if (!token || token.length < 20) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    // Find the auth user with this invitation token in their metadata
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

    // Check token expiry (24 hours)
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
      return NextResponse.json({
        success: false,
        error: 'Incomplete invitation data. Contact your gym for a new link.',
      }, { status: 400 })
    }

    // Verify member exists and portal is in pending state
    const { data: member } = await supabase
      .from('members')
      .select('name, phone, invitation_status')
      .eq('id', memberId)
      .eq('gym_id', gymId)
      .single()

    if (!member) {
      return NextResponse.json({
        success: false,
        error: 'Member record not found. Contact your gym.',
      }, { status: 404 })
    }

    if (member.invitation_status === 'activated') {
      return NextResponse.json({
        success: false,
        error: 'This account has already been activated. Please go to login.',
      }, { status: 409 })
    }

    // Fetch gym name
    const { data: gym } = await supabase
      .from('gyms')
      .select('name')
      .eq('id', gymId)
      .single()

    return NextResponse.json({
      success: true,
      data: {
        memberName: member.name,
        phone: member.phone,
        gymName: gym?.name ?? 'Your Gym',
        gymId,
        currentEmail: authUser.email ?? null,
      },
    })
  } catch (err) {
    console.error('[activate/verify] error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
