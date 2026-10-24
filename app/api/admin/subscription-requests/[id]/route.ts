import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api/adminAuth'

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
  // Hardened guard: fails closed when ADMIN_PASSWORD is unset, requires a
  // non-empty bearer token, compares in constant time, and rate-limits by IP.
  const auth = await requireAdmin(req, 'POST /api/admin/subscription-requests/[id]')
  if (!auth.ok) return auth.response

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
    .select('gym_id, status, plan_requested')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 })
  }

  const now = new Date()

  // A WhatsApp add-on request (Rs 299) must only extend the add-on. This older admin page sends
  // plan_type 'monthly' by default, which would grant a full paid plan for the add-on payment,
  // so the stored request decides here, as in gymflow-admin's approve route.
  if (action === 'approve' && request.plan_requested === 'whatsapp_addon') {
    const { error: addonError } = await supabase.rpc('approve_whatsapp_addon', {
      p_request_id: id,
      p_gym_id: request.gym_id,
      p_reviewed_by: 'admin',
    })
    if (addonError) {
      const status = addonError.code === 'P0002' ? 404 : addonError.code === 'P0001' ? 409 : 500
      return NextResponse.json({ error: 'Could not approve the WhatsApp add-on request' }, { status })
    }
    return NextResponse.json({ success: true })
  }

  // Only real paid plans may be granted here ('free' and 'trial' are not payments).
  if (action === 'approve' && !['monthly', 'yearly', 'lifetime'].includes(plan_type)) {
    return NextResponse.json({ error: 'Invalid plan_type' }, { status: 400 })
  }

  if (action === 'approve') {
    // Compute subscription end date based on plan type
    const endsAt = new Date(now)
    if (plan_type === 'monthly')     endsAt.setMonth(endsAt.getMonth() + 1)
    if (plan_type === 'yearly')      endsAt.setFullYear(endsAt.getFullYear() + 1)
    if (plan_type === 'lifetime')    endsAt.setFullYear(endsAt.getFullYear() + 99)

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

  return NextResponse.json({ success: true })
}
