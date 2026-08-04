/**
 * POST /api/activate/finalize
 *
 * Called by the client-side /activate/error page after it has set the
 * Supabase session from hash tokens (implicit flow). At this point the
 * user is authenticated in the browser. This route completes the DB side:
 *
 *  - Clears invitation token
 *  - Sets invitation_status = 'activated'
 *  - Sets portal_activated_at = NOW()
 *  - Logs portal_activated activity
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
    let body: { userId: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const { userId } = body
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 })
    }

    const serviceSupabase = getServiceSupabase()

    // Fetch the user to get metadata
    const { data: { user }, error: userErr } = await serviceSupabase.auth.admin.getUserById(userId)
    if (userErr || !user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const memberId = user.user_metadata?.member_id
    const gymId = user.user_metadata?.gym_id

    if (!memberId || !gymId) {
      return NextResponse.json({ success: false, error: 'No member linkage found' }, { status: 400 })
    }

    // Clear invitation token + mark complete
    await serviceSupabase.auth.admin.updateUserById(userId, {
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        invitation_token: null,
        activation_step: 'completed',
        activated_at: new Date().toISOString(),
      },
    })

    // Update member row
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

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[activate/finalize] error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
