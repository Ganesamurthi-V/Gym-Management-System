import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { ADMIN_ACTOR, noteSchema, planSchema, sanitizeUUID } from '@/lib/sanitize'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/gyms/[id]/subscription/activate
 * Body: { plan: 'monthly' | 'half_yearly' | 'yearly' | 'lifetime', performed_by?: string, notes?: string }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const id = sanitizeUUID((await props.params).id)
    if (!id) return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    const parsed = z.object({ plan: planSchema, notes: noteSchema }).safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid plan. Must be monthly, half_yearly, yearly, or lifetime.' }, { status: 400 })
    }
    const { plan, notes } = parsed.data
    // Never trust a client-supplied actor name in the audit log.
    const performed_by = ADMIN_ACTOR

    const supabase = createAdminClient()

    // Fetch current state
    const { data: gym, error: fetchError } = await supabase
      .from('gyms')
      .select('subscription_status, plan_type, subscription_ends_at, trial_ends_at, owner_id')
      .eq('id', id)
      .single()
    if (fetchError) throw fetchError

    const now = new Date()
    let endsAt: string | null = null

    if (plan === 'monthly') {
      const d = new Date(now)
      d.setMonth(d.getMonth() + 1)
      endsAt = d.toISOString()
    } else if (plan === 'half_yearly') {
      const d = new Date(now)
      d.setMonth(d.getMonth() + 6)
      endsAt = d.toISOString()
    } else if (plan === 'yearly') {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() + 1)
      endsAt = d.toISOString()
    } else if (plan === 'lifetime') {
      endsAt = null
    }

    // Update gym — always clear trial fields when activating a paid plan
    const { error: updateError } = await supabase
      .from('gyms')
      .update({
        subscription_status: 'active',
        plan_type: plan,
        subscription_started_at: now.toISOString(),
        subscription_ends_at: endsAt,
        // Clear trial remnants so middleware sees a clean 'active' state
        trial_ends_at: null,
        last_payment_status: 'paid',
        last_payment_date: now.toISOString(),
      })
      .eq('id', id)
    if (updateError) throw updateError

    // Log audit
    await supabase.rpc('log_subscription_action', {
      p_gym_id: id,
      p_action: `Activated ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
      p_prev_status: gym.subscription_status,
      p_new_status: 'active',
      p_prev_plan: gym.plan_type,
      p_new_plan: plan,
      p_prev_expiry: gym.subscription_ends_at || gym.trial_ends_at || null,
      p_new_expiry: endsAt,
      p_performed_by: performed_by,
      p_notes: notes || null,
    })

    return NextResponse.json({
      success: true,
      subscription_status: 'active',
      plan_type: plan,
      subscription_ends_at: endsAt,
    })
  } catch (err: any) {
    console.error('[SubActivate]', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
