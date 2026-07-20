import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

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
    const { id } = await props.params
    const { subscription_started_at, subscription_ends_at, trial_started_at, trial_ends_at, performed_by = 'admin', notes } = await req.json()

    const supabase = createAdminClient()

    const { data: gym, error: fetchError } = await supabase
      .from('gyms')
      .select('subscription_started_at, subscription_ends_at, trial_started_at, trial_ends_at, owner_id')
      .eq('id', id)
      .single()
    if (fetchError) throw fetchError

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
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
