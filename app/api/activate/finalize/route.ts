/**
 * POST /api/activate/finalize
 *
 * Called by /activate/verifying after the session cookie is set (redeem or
 * set-session). The caller must be signed in; this route completes the DB side:
 *
 *  - Clears invitation token
 *  - Sets invitation_status = 'activated'
 *  - Sets portal_activated_at = NOW()
 *  - Logs portal_activated activity
 */

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/*
 * Who is being activated comes ONLY from the caller's own session cookie, and the
 * member row is found through members.auth_user_id (linked server-side by the invite
 * route). This route used to take `userId` from the request body and act on it with
 * the service role, so anyone holding another member's auth id could force-complete
 * or break that member's activation without being signed in. user_metadata
 * (member_id / gym_id) is not trusted either: users can edit their own metadata.
 */
function getServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing service role configuration')
  return createServiceClient(url, key)
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })
    }

    const serviceSupabase = getServiceSupabase()

    const { data: member, error: memberErr } = await serviceSupabase
      .from('members')
      .select('id, gym_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (memberErr) {
      console.error('[activate/finalize] member lookup failed:', memberErr.message)
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
    }
    if (!member) {
      return NextResponse.json({ success: false, error: 'No member linkage found' }, { status: 400 })
    }

    // Clear invitation token + mark complete
    const { error: updateUserErr } = await serviceSupabase.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        invitation_token: null,
        activation_step: 'completed',
        activated_at: new Date().toISOString(),
      },
    })
    if (updateUserErr) {
      console.error('[activate/finalize] auth user update failed:', updateUserErr.message)
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
    }

    const { error: memberUpdateErr } = await serviceSupabase
      .from('members')
      .update({
        invitation_status: 'activated',
        portal_activated_at: new Date().toISOString(),
        portal_enabled: true,
      })
      .eq('id', member.id)
      .eq('gym_id', member.gym_id)
    if (memberUpdateErr) {
      console.error('[activate/finalize] member update failed:', memberUpdateErr.message)
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
    }

    // Log activity (non-critical: activation already succeeded)
    const { error: activityErr } = await serviceSupabase.from('member_portal_activity').insert({
      gym_id: member.gym_id,
      member_id: member.id,
      activity: 'portal_activated',
      performed_by: 'member',
    })
    if (activityErr) console.error('[activate/finalize] activity log failed:', activityErr.message)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[activate/finalize] error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
