import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, adminServerError } from '@/lib/api/adminAuth'

export const dynamic = 'force-dynamic'

const ROUTE = 'GET /api/gyms'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROUTE)
  if (!auth.ok) return auth.response

  try {
    const supabase = createAdminClient()

    const { data: gyms, error } = await supabase
      .from('gyms')
      .select('id, name, created_at, is_active, owner_id')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Fetch members count for each
    const { data: members, error: membersError } = await supabase
      .from('members')
      .select('gym_id')

    if (membersError) throw membersError

    const memberCounts = members?.reduce((acc: any, m: any) => {
      acc[m.gym_id] = (acc[m.gym_id] || 0) + 1
      return acc
    }, {}) || {}

    const result = gyms.map(g => ({
      id: g.id,
      name: g.name,
      created_at: g.created_at,
      is_active: g.is_active ?? true,
      memberCount: memberCounts[g.id] || 0,
    }))

    // NOTE: the previous `console.log` dumped every gym name + owner_id on each
    // request. Removed — this is cross-tenant data and does not belong in logs.
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err: unknown) {
    return adminServerError(ROUTE, err)
  }
}
