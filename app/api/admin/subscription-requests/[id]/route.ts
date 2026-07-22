import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/subscription-requests/[id]
 *
 * Approves or rejects a subscription request.
 * Protected by ADMIN_PASSWORD (same pattern as /api/gyms/route.ts).
 *
 * Body: { action: 'approve' | 'reject', plan_type?: string, rejection_reason?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = req.headers.get('authorization')?.split(' ')[1]
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: { action: string; plan_type?: string; rejection_reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, plan_type = 'monthly', rejection_reason } = body

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Fetch the request to get gym_id
  const { data: request } = await supabase
    .from('subscription_requests')
    .select('gym_id, status')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 })
  }

  const now = new Date()

  if (action === 'approve') {
    // Compute subscription end date based on plan type
    const endsAt = new Date(now)
    if (plan_type === 'monthly')  endsAt.setMonth(endsAt.getMonth() + 1)
    if (plan_type === 'yearly')   endsAt.setFullYear(endsAt.getFullYear() + 1)
    if (plan_type === 'lifetime') endsAt.setFullYear(endsAt.getFullYear() + 99)

    // Update gym to active
    const { error: gymError } = await supabase
      .from('gyms')
      .update({
        subscription_status:      'active',
        plan_type,
        subscription_started_at:  now.toISOString(),
        subscription_ends_at:     plan_type === 'lifetime' ? null : endsAt.toISOString(),
      })
      .eq('id', request.gym_id)

    if (gymError) {
      return NextResponse.json({ error: gymError.message }, { status: 500 })
    }

    // Mark request as approved
    await supabase
      .from('subscription_requests')
      .update({ status: 'approved', reviewed_at: now.toISOString(), reviewed_by: 'admin' })
      .eq('id', id)
  }

  if (action === 'reject') {
    await supabase
      .from('subscription_requests')
      .update({
        status: 'rejected',
        reviewed_at: now.toISOString(),
        reviewed_by: 'admin',
        rejection_reason: rejection_reason ?? '',
      })
      .eq('id', id)
  }

  // ── Realtime broadcasts ─────────────────────────────────────────────────
  // 1. Notify the gym owner's subscription page via their dedicated channel.
  //    The SubscriptionClient listens on `gym-{gym_id}-requests` for request
  //    status changes and `gym-{gym_id}-subclient` for gym row changes.
  //    postgres_changes already fires for both tables, but an explicit broadcast
  //    provides a fallback if RLS filtering blocks the change event.
  try {
    await supabase.channel(`gym-${request.gym_id}-requests`).send({
      type: 'broadcast',
      event: 'subscription_reviewed',
      payload: {
        request_id: id,
        gym_id: request.gym_id,
        action,
        plan_type: action === 'approve' ? plan_type : undefined,
        rejection_reason: action === 'reject' ? (rejection_reason ?? '') : undefined,
        timestamp: now.toISOString(),
      },
    })
  } catch {
    // Non-critical — postgres_changes on subscription_requests + gyms will still fire
  }

  // 2. Notify other admin tabs that the request was processed.
  //    The AdminSubscriptionList listens on postgres_changes UPDATE events,
  //    but broadcast ensures instant sync across multiple admin sessions.
  try {
    await supabase.channel('admin_subscription_requests_realtime').send({
      type: 'broadcast',
      event: 'subscription_request_reviewed',
      payload: {
        request_id: id,
        gym_id: request.gym_id,
        action,
        timestamp: now.toISOString(),
      },
    })
  } catch {
    // Non-critical
  }

  return NextResponse.json({ success: true })
}
