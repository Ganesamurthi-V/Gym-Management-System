import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
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

    const { data: gyms, error } = await supabase
      .from('gyms')
      .select('id, name, created_at, is_active, owner_id')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Fetch members count for each
    const { data: members, error: mErr } = await supabase
      .from('members')
      .select('gym_id')
    
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

    console.log('[GET /api/gyms] Result:', JSON.stringify(result, null, 2))
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
