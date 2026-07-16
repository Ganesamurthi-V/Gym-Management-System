import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function auth(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.split(' ')[1]
  return token === process.env.ADMIN_PASSWORD
}

/**
 * POST /api/gyms/[id]/subscription/payment/approve
 * Body: {
 *   request_id: string,
 *   plan: 'monthly' | 'yearly' | 'lifetime',
 *   performed_by?: string,
 *   notes?: string,
 * }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await props.params
    const { request_id, plan = 'monthly', performed_by = 'admin', notes } = await req.json()

    if (!request_id) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Verify the request belongs to this gym and is pending
    const { data: request, error: reqError } = await supabase
      .from('subscription_requests')
      .select('*')
      .eq('id', request_id)
      .eq('gym_id', id)
      .eq('status', 'pending')
      .single()
    if (reqError || !request) {
      return NextResponse.json({ error: 'Pending request not found' }, { status: 404 })
    }

    const { data: gym, error: gymError } = await supabase
      .from('gyms')
      .select('subscription_status, plan_type, subscription_ends_at, trial_ends_at')
      .eq('id', id)
      .single()
    if (gymError) throw gymError

    // Compute new expiry
    const now = new Date()
    let endsAt: string | null = null
    if (plan === 'monthly') {
      const d = new Date(now); d.setMonth(d.getMonth() + 1); endsAt = d.toISOString()
    } else if (plan === 'yearly') {
      const d = new Date(now); d.setFullYear(d.getFullYear() + 1); endsAt = d.toISOString()
    }

    // Approve the request
    const { error: approveError } = await supabase
      .from('subscription_requests')
      .update({
        status: 'approved',
        reviewed_at: now.toISOString(),
        reviewed_by: performed_by,
      })
      .eq('id', request_id)
    if (approveError) throw approveError

    // Activate the gym subscription
    const { error: updateError } = await supabase
      .from('gyms')
      .update({
        subscription_status: 'active',
        plan_type: plan,
        subscription_started_at: now.toISOString(),
        subscription_ends_at: endsAt,
        is_payment_verified: true,
        last_payment_status: 'paid',
        last_transaction_id: request.transaction_id || null,
        last_payment_date: now.toISOString(),
      })
      .eq('id', id)
    if (updateError) throw updateError

    await supabase.rpc('log_subscription_action', {
      p_gym_id: id,
      p_action: `Payment Approved — ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan Activated`,
      p_prev_status: gym.subscription_status,
      p_new_status: 'active',
      p_prev_plan: gym.plan_type,
      p_new_plan: plan,
      p_prev_expiry: gym.subscription_ends_at || gym.trial_ends_at || null,
      p_new_expiry: endsAt,
      p_performed_by: performed_by,
      p_notes: notes || `Transaction ID: ${request.transaction_id || 'N/A'}`,
    })

    return NextResponse.json({
      success: true,
      subscription_status: 'active',
      plan_type: plan,
      subscription_ends_at: endsAt,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
