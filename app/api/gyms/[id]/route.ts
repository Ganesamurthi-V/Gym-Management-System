import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, adminServerError } from '@/lib/api/adminAuth'
import { isValidUUID } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

const ROUTE = 'GET /api/gyms/[id]'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ROUTE)
  if (!auth.ok) return auth.response

  try {
    const params = await props.params

    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    }

    const supabase = createAdminClient()

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

    return NextResponse.json(
      { gym: responseGym, owner },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err: unknown) {
    return adminServerError(ROUTE, err)
  }
}
