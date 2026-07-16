import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

/** GET /api/admin/gyms/[id]/subscription/detail
 *  Returns full subscription data, owner info, pending requests, audit logs, usage stats.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await props.params
    const supabase = createAdminClient()

    // Fetch gym + all subscription columns
    const { data: gym, error: gymError } = await supabase
      .from('gyms')
      .select(`
        id, name, owner_id, is_active, created_at, city, phone,
        subscription_status, plan_type,
        trial_started_at, trial_ends_at,
        subscription_started_at, subscription_ends_at,
        admin_notes,
        is_vip, is_payment_verified, whatsapp_enabled,
        priority_support, auto_renewal_eligible, lifetime_offer, login_disabled,
        last_payment_amount, last_payment_method, last_transaction_id,
        last_payment_date, last_payment_status
      `)
      .eq('id', id)
      .single()

    if (gymError) throw gymError

    // Fetch owner info from auth.users
    let owner = null
    if (gym.owner_id) {
      const { data: { user } } = await supabase.auth.admin.getUserById(gym.owner_id)
      if (user) {
        owner = {
          email: user.email,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          email_confirmed_at: user.email_confirmed_at,
          phone: user.phone,
          user_metadata: user.user_metadata,
          app_metadata: user.app_metadata,
        }
      }
    }

    // Fetch pending subscription request
    const { data: pendingRequest } = await supabase
      .from('subscription_requests')
      .select('*')
      .eq('gym_id', id)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch last approved payment info
    const { data: lastApprovedRequest } = await supabase
      .from('subscription_requests')
      .select('*')
      .eq('gym_id', id)
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch audit timeline (last 50)
    const { data: timeline } = await supabase
      .from('subscription_audit_logs')
      .select('*')
      .eq('gym_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    // Fetch usage stats
    const { data: usageStats } = await supabase
      .from('gym_usage_stats')
      .select('*')
      .eq('gym_id', id)
      .maybeSingle()

    return NextResponse.json({
      gym,
      owner,
      pendingRequest: pendingRequest || null,
      lastApprovedRequest: lastApprovedRequest || null,
      timeline: timeline || [],
      usageStats: usageStats || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
