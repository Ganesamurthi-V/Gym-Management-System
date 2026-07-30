/**
 * POST /api/activate/status
 *
 * Polled by the "Check Your Email" page to detect when the member has
 * clicked the verification link and the account is activated.
 *
 * Returns { activated: true } once the member_portal_activity row shows
 * 'portal_activated' or the member's invitation_status is 'activated'.
 *
 * Public endpoint — uses the invitation token for authorization.
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
      return NextResponse.json({ activated: false }, { status: 400 })
    }

    const { token } = body
    if (!token || token.length < 20) {
      return NextResponse.json({ activated: false })
    }

    const supabase = getServiceSupabase()

    // Find auth user by token
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (!usersData) return NextResponse.json({ activated: false })

    const authUser = usersData.users.find(
      u => u.user_metadata?.invitation_token === token
    )

    // If the token is cleared, it means activation completed (token is single-use)
    if (!authUser) {
      // Token was cleared → activation completed
      return NextResponse.json({ activated: true })
    }

    // Check if the activation_step is 'completed'
    if (authUser.user_metadata?.activation_step === 'completed') {
      return NextResponse.json({ activated: true })
    }

    // Also check member row directly
    const memberId = authUser.user_metadata?.member_id
    const gymId = authUser.user_metadata?.gym_id
    if (memberId && gymId) {
      const { data: member } = await supabase
        .from('members')
        .select('invitation_status')
        .eq('id', memberId)
        .eq('gym_id', gymId)
        .single()

      if (member?.invitation_status === 'activated') {
        return NextResponse.json({ activated: true })
      }
    }

    return NextResponse.json({ activated: false })
  } catch {
    return NextResponse.json({ activated: false })
  }
}
