import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { ADMIN_ACTOR, noteSchema, planSchema, sanitizeUUID } from '@/lib/sanitize'
import { z } from 'zod'

// Local, not planSchema: 'whatsapp_addon' must never be accepted by the activate route, where it
// would be written to gyms.plan_type.
const approvePlanSchema = z.enum([...planSchema.options, 'whatsapp_addon'])


export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/gyms/[id]/subscription/payment/approve
 * Body: {
 *   request_id: string,
 *   plan: 'monthly' | 'yearly' | 'lifetime' | 'whatsapp_addon'  (add-on is decided by the stored request, not this field),
 *   performed_by?: string,
 *   notes?: string,
 * }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const id = sanitizeUUID((await props.params).id)
    if (!id) return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    const rawBody = (await req.json().catch(() => null)) ?? {}
    const parsed = z.object({ request_id: z.string().uuid(), plan: approvePlanSchema.default('monthly'), notes: noteSchema })
      .safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'A valid request_id and plan are required' }, { status: 400 })
    }
    const { request_id, notes } = parsed.data
    let plan = parsed.data.plan
    const performed_by = ADMIN_ACTOR

    const supabase = createAdminClient()

    // Verify the request belongs to this gym and is pending
    const { data: request, error: reqError } = await supabase
      .from('subscription_requests')
      .select('*, plan_requested')
      .eq('id', request_id)
      .eq('gym_id', id)
      .eq('status', 'pending')
      .single()
    if (reqError || !request) {
      return NextResponse.json({ error: 'Pending request not found' }, { status: 404 })
    }

    const { data: gym, error: gymError } = await supabase
      .from('gyms')
      .select('subscription_status, plan_type, subscription_ends_at, trial_ends_at, owner_id')
      .eq('id', id)
      .single()
    if (gymError) throw gymError

    // The stored request decides add-on vs plan. A client-supplied plan can never turn a plan
    // request into an add-on (which would skip activation) or an add-on request into a plan
    // (which would grant a full plan for Rs 299).
    const isAddonRequest = request.plan_requested === 'whatsapp_addon'
    if (!isAddonRequest && plan === 'whatsapp_addon') {
      return NextResponse.json({ error: 'This request is not a WhatsApp add-on request' }, { status: 400 })
    }

    // The request already names the plan the owner paid for, so a client that omitted `plan` (and
    // got the schema default 'monthly') must not turn a yearly payment into a monthly grant.
    if (!isAddonRequest && !('plan' in rawBody) && (request.plan_requested === 'monthly' || request.plan_requested === 'yearly')) {
      plan = request.plan_requested
    }

    // Add-on: the SQL function locks the request and only extends whatsapp_addon_until, so a Free
    // gym stays Free and a paid gym keeps its own expiry. The client plan is ignored entirely.
    if (isAddonRequest) {
      const { data: addonUntil, error: addonError } = await supabase.rpc('approve_whatsapp_addon', {
        p_request_id: request_id,
        p_gym_id: id,
        p_reviewed_by: performed_by,
      })
      if (addonError) {
        if (addonError.code === 'P0002') {
          return NextResponse.json({ error: 'Pending request not found' }, { status: 404 })
        }
        if (addonError.code === 'P0001') {
          const error = addonError.message?.includes('request_not_pending')
            ? 'This request was already handled'
            : 'Request does not match this gym or is not a WhatsApp add-on request'
          return NextResponse.json({ error }, { status: 409 })
        }
        throw addonError
      }

      const { error: addonLogError } = await supabase.rpc('log_subscription_action', {
        p_gym_id: id,
        p_action: 'Payment Approved: WhatsApp Add-on',
        p_prev_status: gym.subscription_status,
        p_new_status: gym.subscription_status,
        p_prev_plan: gym.plan_type,
        p_new_plan: gym.plan_type,
        p_prev_expiry: gym.subscription_ends_at || gym.trial_ends_at || null,
        p_new_expiry: gym.subscription_ends_at || gym.trial_ends_at || null,
        p_performed_by: performed_by,
        p_notes: notes || `WhatsApp add-on until ${addonUntil}. Transaction ID: ${request.transaction_id || 'N/A'}`,
      })
      if (addonLogError) console.error('[PaymentApprove] audit log failed', addonLogError)

      return NextResponse.json({ success: true, whatsapp_addon_until: addonUntil })
    }

    // One SQL function locks the request and the gym and does approval + activation atomically, so
    // a partial failure cannot leave an approved request on an unactivated gym. It also adds a
    // renewal to the remaining time and records the request's expected amount as the payment.
    const { data: endsAt, error: approveError } = await supabase.rpc('approve_plan_payment', {
      p_request_id: request_id,
      p_gym_id: id,
      p_plan: plan,
      p_reviewed_by: performed_by,
    })
    if (approveError) {
      const msg = approveError.message || ''
      if (approveError.code === 'P0002') {
        return NextResponse.json({ error: 'Pending request not found' }, { status: 404 })
      }
      if (approveError.code === 'P0001') {
        if (msg.includes('request_not_pending')) {
          return NextResponse.json({ error: 'This request was already handled' }, { status: 409 })
        }
        if (msg.includes('already_lifetime')) {
          return NextResponse.json({ error: 'This gym is already on the Lifetime plan' }, { status: 409 })
        }
        if (msg.includes('plan_mismatch')) {
          return NextResponse.json({ error: 'This payment was for a different plan' }, { status: 409 })
        }
        if (msg.includes('invalid_plan')) {
          return NextResponse.json({ error: 'Invalid plan. Must be monthly, yearly, or lifetime.' }, { status: 400 })
        }
        return NextResponse.json({ error: 'Request does not match this gym or is a WhatsApp add-on request' }, { status: 409 })
      }
      throw approveError
    }

    await supabase.rpc('log_subscription_action', {
      p_gym_id: id,
      p_action: `Payment Approved — ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan Activated`,
      p_prev_status: gym.subscription_status,
      p_new_status: 'active',
      p_prev_plan: gym.plan_type,
      p_new_plan: plan,
      p_prev_expiry: gym.subscription_ends_at || gym.trial_ends_at || null,
      p_new_expiry: endsAt ?? null,
      p_performed_by: performed_by,
      p_notes: notes || `Transaction ID: ${request.transaction_id || 'N/A'}`,
    })

    return NextResponse.json({
      success: true,
      subscription_status: 'active',
      plan_type: plan,
      subscription_ends_at: endsAt ?? null,
    })
  } catch (err: any) {
    console.error('[PaymentApprove]', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
