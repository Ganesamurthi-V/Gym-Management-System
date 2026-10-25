import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { ADMIN_ACTOR, noteSchema, sanitizeUUID } from '@/lib/sanitize'
import { z } from 'zod'

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
    const id = sanitizeUUID((await props.params).id)
    if (!id) return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    const parsed = z.object({
      action: z.enum(['extend', 'reset', 'custom']),
      // Bounded: an absurd value would push the date out of Date's range and throw.
      days: z.number().int().min(-3650).max(3650).optional(),
      notes: noteSchema,
    }).safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action or days. Action must be extend, reset, or custom.' }, { status: 400 })
    }
    const { action, days, notes } = parsed.data
    const performed_by = ADMIN_ACTOR

    const supabase = createAdminClient()

    const { data: gym, error: fetchError } = await supabase
      .from('gyms')
      .select('subscription_status, plan_type, trial_started_at, trial_ends_at, owner_id')
      .eq('id', id)
      .single()
    if (fetchError) throw fetchError

    // Writing plan_type 'trial' below would silently downgrade a paying gym, so refuse before any write.
    if (['monthly', 'quarterly', 'yearly', 'lifetime'].includes(gym.plan_type)) {
      return NextResponse.json({ error: 'Trial actions are not available for gyms on a paid plan' }, { status: 409 })
    }

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
      // From the later of now and the current end: extending a lapsed trial from its past end date
      // would leave it expired.
      const base = gym.trial_ends_at && new Date(gym.trial_ends_at) > now ? new Date(gym.trial_ends_at) : now
      const endsAt = new Date(base)
      endsAt.setDate(endsAt.getDate() + extendDays)
      newTrialEndsAt = endsAt.toISOString()
      actionLabel = `Trial Extended by ${extendDays} Days`
    } else if (action === 'custom') {
      const extendDays = days ?? 7
      const base = gym.trial_ends_at && new Date(gym.trial_ends_at) > now ? new Date(gym.trial_ends_at) : now
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
    console.error('[SubTrial]', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
