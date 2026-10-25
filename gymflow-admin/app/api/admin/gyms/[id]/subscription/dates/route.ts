import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { ADMIN_ACTOR, dateOrClearSchema, noteSchema, sanitizeUUID } from '@/lib/sanitize'
import { z } from 'zod'
import { isPaidPlan } from '@/lib/plan'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/gyms/[id]/subscription/dates
 * Body: {
 *   subscription_started_at?: string | null,
 *   subscription_ends_at?: string | null,
 *   trial_started_at?: string | null,
 *   trial_ends_at?: string | null,
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
      subscription_started_at: dateOrClearSchema,
      subscription_ends_at: dateOrClearSchema,
      trial_started_at: dateOrClearSchema,
      trial_ends_at: dateOrClearSchema,
      notes: noteSchema,
    }).safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    const { subscription_started_at, subscription_ends_at, trial_started_at, trial_ends_at, notes } = parsed.data
    const performed_by = ADMIN_ACTOR

    const supabase = createAdminClient()

    const { data: gym, error: fetchError } = await supabase
      .from('gyms')
      .select('plan_type, subscription_started_at, subscription_ends_at, trial_started_at, trial_ends_at, owner_id')
      .eq('id', id)
      .single()
    // Fail closed: a failed plan lookup throws (500) instead of letting the write through.
    if (fetchError) throw fetchError

    // Editing trial dates on a paid gym is the trial reset by another door (see trial/route.ts).
    if ((trial_started_at !== undefined || trial_ends_at !== undefined) && isPaidPlan(gym.plan_type)) {
      return NextResponse.json({ error: 'Trial dates cannot be changed for gyms on a paid plan' }, { status: 409 })
    }

    const updates: Record<string, any> = {}
    if (subscription_started_at !== undefined) updates.subscription_started_at = subscription_started_at || null
    if (subscription_ends_at !== undefined) updates.subscription_ends_at = subscription_ends_at || null
    if (trial_started_at !== undefined) updates.trial_started_at = trial_started_at || null
    if (trial_ends_at !== undefined) updates.trial_ends_at = trial_ends_at || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No date fields provided' }, { status: 400 })
    }

    const { error } = await supabase
      .from('gyms')
      .update(updates)
      .eq('id', id)
    if (error) throw error

    await supabase.rpc('log_subscription_action', {
      p_gym_id: id,
      p_action: 'Subscription Dates Updated',
      p_prev_expiry: gym.subscription_ends_at || gym.trial_ends_at || null,
      p_new_expiry: updates.subscription_ends_at || updates.trial_ends_at || null,
      p_performed_by: performed_by,
      p_notes: notes || Object.keys(updates).map(k => `${k}: ${updates[k]}`).join(', '),
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[SubDates]', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
