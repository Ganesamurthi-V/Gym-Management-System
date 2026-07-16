import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { invalidateSubscriptionCachesForOwner } from '@/lib/cache'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/gyms/[id]/subscription/trial
 * Body: {
 *   action: 'extend' | 'reset' | 'custom',
 *   days?: number,            // for extend or custom
 *   performed_by?: string,
 *   notes?: string,
 * }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await props.params
    const { action, days, performed_by = 'admin', notes } = await req.json()

    if (!['extend', 'reset', 'custom'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be extend, reset, or custom.' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: gym, error: fetchError } = await supabase
      .from('gyms')
      .select('subscription_status, plan_type, trial_started_at, trial_ends_at, owner_id')
      .eq('id', id)
      .single()
    if (fetchError) throw fetchError

    const now = new Date()
    let newTrialStartedAt: string | null = null
    let newTrialEndsAt: string | null = null
    let actionLabel = ''

    if (action === 'reset') {
      // Reset to a fresh 14-day trial from today
      const endsAt = new Date(now)
      endsAt.setDate(endsAt.getDate() + 14)
      newTrialStartedAt = now.toISOString()
      newTrialEndsAt = endsAt.toISOString()
      actionLabel = 'Trial Reset (14 Days from Today)'
    } else if (action === 'extend') {
      const extendDays = days ?? 7
      // Extend from current trial end or from now
      const base = gym.trial_ends_at ? new Date(gym.trial_ends_at) : now
      const endsAt = new Date(base)
      endsAt.setDate(endsAt.getDate() + extendDays)
      newTrialEndsAt = endsAt.toISOString()
      actionLabel = `Trial Extended by ${extendDays} Days`
    } else if (action === 'custom') {
      const extendDays = days ?? 7
      const base = gym.trial_ends_at ? new Date(gym.trial_ends_at) : now
      const endsAt = new Date(base)
      endsAt.setDate(endsAt.getDate() + extendDays)
      newTrialEndsAt = endsAt.toISOString()
      actionLabel = `Trial Extended by ${extendDays} Days (Custom)`
    }

    const updateData: Record<string, any> = {
      subscription_status: 'trial',
      plan_type: 'trial',
      trial_ends_at: newTrialEndsAt,
    }
    if (newTrialStartedAt) {
      updateData.trial_started_at = newTrialStartedAt
    }

    const { error: updateError } = await supabase
      .from('gyms')
      .update(updateData)
      .eq('id', id)
    if (updateError) throw updateError

    await invalidateSubscriptionCachesForOwner(supabase, gym.owner_id)

    await supabase.rpc('log_subscription_action', {
      p_gym_id: id,
      p_action: actionLabel,
      p_prev_status: gym.subscription_status,
      p_new_status: 'trial',
      p_prev_plan: gym.plan_type,
      p_new_plan: 'trial',
      p_prev_expiry: gym.trial_ends_at || null,
      p_new_expiry: newTrialEndsAt,
      p_performed_by: performed_by,
      p_notes: notes || null,
    })

    return NextResponse.json({
      success: true,
      subscription_status: 'trial',
      trial_ends_at: newTrialEndsAt,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
