import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

// GET /api/gyms — list all gyms with owner info and stats
export async function GET(req: NextRequest) {
  // Security fix: Verify authentication
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Security fix: Rate limiting
  const rateLimitResponse = await rateLimit(
    req,
    'gyms_list',
    RATE_LIMITS.GYM_LIST.limit,
    RATE_LIMITS.GYM_LIST.window
  )
  if (rateLimitResponse) return rateLimitResponse

  try {
    const supabase = createAdminClient()

    const { data: gyms, error } = await supabase
      .from('gyms')
      .select(`
        id, name, created_at, owner_id,
        members ( count ),
        memberships ( count )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    const { data: { users } } = await supabase.auth.admin.listUsers()

    const gymsWithOwners = gyms.map(gym => {
      const owner = users.find(u => u.id === gym.owner_id)
      return {
        ...gym,
        owner: { email: owner?.email ?? 'Unknown Email' }
      }
    })

    return NextResponse.json(gymsWithOwners)
  } catch (error: any) {
    console.error('Gyms fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch gyms' }, { status: 500 })
  }
}
