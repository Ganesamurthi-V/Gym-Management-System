import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.split(' ')[1]
    const validPassword = process.env.ADMIN_PASSWORD
    
    if (token !== validPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: gym, error } = await supabase
      .from('gyms')
      .select('id, name, created_at, is_active, owner_id, subscription_status, plan_type, trial_ends_at, subscription_ends_at')
      .eq('id', params.id)
      .single()

    if (error) throw error

    let owner = null
    if (gym?.owner_id) {
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(gym.owner_id)
      if (user) {
        owner = {
          email: user.email,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          email_confirmed_at: user.email_confirmed_at,
        }
      }
    }

    // Ensure is_active is boolean true if undefined
    const responseGym = {
      ...gym,
      is_active: gym.is_active ?? true
    }

    return NextResponse.json({ gym: responseGym, owner })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
