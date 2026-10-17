import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { ADMIN_ACTOR, sanitizeUUID } from '@/lib/sanitize'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/gyms/[id]/subscription/payment/reject
 * Body: {
 *   request_id: string,
 *   rejection_reason: string,
 *   performed_by?: string,
 * }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const id = sanitizeUUID((await props.params).id)
    if (!id) return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    const parsed = z.object({ request_id: z.string().uuid(), rejection_reason: z.string().trim().min(1).max(500) })
      .safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'request_id and rejection_reason are required' }, { status: 400 })
    }
    const { request_id, rejection_reason } = parsed.data
    const performed_by = ADMIN_ACTOR

    const supabase = createAdminClient()

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
    console.error('[PaymentReject]', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
