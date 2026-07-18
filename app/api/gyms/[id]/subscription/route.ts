import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.split(' ')[1]
    const validPassword = process.env.ADMIN_PASSWORD
    
    if (token !== validPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { subscription_status, plan_type, trial_ends_at, subscription_ends_at } = await req.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const updates: any = {}
    if (subscription_status !== undefined) updates.subscription_status = subscription_status
    if (plan_type !== undefined) updates.plan_type = plan_type
    
    // Convert empty strings back to null for dates
    if (trial_ends_at !== undefined) updates.trial_ends_at = trial_ends_at || null
    if (subscription_ends_at !== undefined) updates.subscription_ends_at = subscription_ends_at || null

    const { data: gym, error } = await supabase
      .from('gyms')
      .update(updates)
      .eq('id', params.id)
      .select('owner_id')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
