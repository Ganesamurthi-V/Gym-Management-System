import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

// GET /api/gyms/[gymId] — gym detail with owner info
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gymId: string }> }
) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { gymId } = await params
  const supabase = createAdminClient()

  const gymRes = await supabase
    .from('gyms')
    .select('id, name, owner_id, created_at, is_active')
    .eq('id', gymId)
    .single()

  if (gymRes.error || !gymRes.data) {
    return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
  }

  const gym = gymRes.data

  const { data: { user: owner } } = await supabase.auth.admin.getUserById(gym.owner_id)

  return NextResponse.json({
    gym,
    owner: owner ? {
      email: owner.email,
      created_at: owner.created_at,
      last_sign_in_at: owner.last_sign_in_at,
      email_confirmed_at: owner.email_confirmed_at,
    } : null,
  })
}
