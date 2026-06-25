import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

// GET /api/gyms — list all gyms with owner info and stats
export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: gyms, error } = await supabase
    .from('gyms')
    .select(`
      id, name, created_at, owner_id,
      members ( count ),
      memberships ( count )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { users } } = await supabase.auth.admin.listUsers()

  const gymsWithOwners = gyms.map(gym => {
    const owner = users.find(u => u.id === gym.owner_id)
    return {
      ...gym,
      owner: { email: owner?.email ?? 'Unknown Email' }
    }
  })

  return NextResponse.json(gymsWithOwners)
}
