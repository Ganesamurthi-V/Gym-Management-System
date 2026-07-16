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
 * POST /api/gyms/[id]/subscription/payment/reject
 * Body: {
 *   request_id: string,
 *   rejection_reason: string,
 *   performed_by?: string,
 * }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await props.params
    const { request_id, rejection_reason, performed_by = 'admin' } = await req.json()

    if (!request_id || !rejection_reason?.trim()) {
      return NextResponse.json({ error: 'request_id and rejection_reason are required' }, { status: 400 })
    }

    const supabase = getAdminClient()

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

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('subscription_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejection_reason.trim(),
        reviewed_at: now,
        reviewed_by: performed_by,
      })
      .eq('id', request_id)
    if (error) throw error

    await supabase.rpc('log_subscription_action', {
      p_gym_id: id,
      p_action: 'Payment Proof Rejected',
      p_prev_status: null,
      p_new_status: null,
      p_prev_plan: null,
      p_new_plan: null,
      p_prev_expiry: null,
      p_new_expiry: null,
      p_performed_by: performed_by,
      p_notes: `Reason: ${rejection_reason.trim()}`,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
