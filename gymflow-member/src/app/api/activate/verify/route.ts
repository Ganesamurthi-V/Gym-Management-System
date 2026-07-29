/**
 * POST /api/activate/verify
 *
 * Validates an invitation token and returns the member's display info.
 * This is a public endpoint — no auth required (the member hasn't logged in yet).
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY to look up auth user metadata since the
 * anon key cannot access auth.users.
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
        error: 'This activation link is invalid or has already been used.',
      }, { status: 404 })
    }

    const memberId = authUser.user_metadata?.member_id
    const gymId = authUser.user_metadata?.gym_id

    if (!memberId || !gymId) {
      return NextResponse.json({
        success: false,
        error: 'Incomplete invitation data. Contact your gym for a new link.',
      }, { status: 400 })
    }

    // Fetch member and gym info
    const [memberRes, gymRes] = await Promise.all([
      supabase.from('members').select('name, phone').eq('id', memberId).single(),
      supabase.from('gyms').select('name').eq('id', gymId).single(),
    ])

    if (!memberRes.data || !gymRes.data) {
      return NextResponse.json({
        success: false,
        error: 'Member or gym data not found. Contact your gym.',
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        memberName: memberRes.data.name,
        phone: memberRes.data.phone,
        gymName: gymRes.data.name,
        gymId,
        currentEmail: authUser.email ?? null,
      },
    })
  } catch (err) {
    console.error('[activate/verify] error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
