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

/** POST /api/gyms/[id]/subscription/expire
 *  Body: { performed_by?: string, notes?: string }
 *  Immediately marks subscription as expired.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await props.params
    const { performed_by = 'admin', notes } = await req.json()
    const supabase = getAdminClient()

    const { data: gym, error: fetchError } = await supabase
      .from('gyms')
      .select('subscription_status, plan_type, subscription_ends_at, trial_ends_at')
      .eq('id', id)
      .single()
    if (fetchError) throw fetchError

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('gyms')
      .update({
        subscription_status: 'expired',
        subscription_ends_at: now,
      })
      .eq('id', id)
    if (error) throw error

    await supabase.rpc('log_subscription_action', {
      p_gym_id: id,
      p_action: 'Subscription Expired (Admin Action)',
      p_prev_status: gym.subscription_status,
      p_new_status: 'expired',
      p_prev_plan: gym.plan_type,
      p_new_plan: gym.plan_type,
      p_prev_expiry: gym.subscription_ends_at || gym.trial_ends_at || null,
      p_new_expiry: now,
      p_performed_by: performed_by,
      p_notes: notes || null,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
