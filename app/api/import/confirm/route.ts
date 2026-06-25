import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    const { rows, gym_id } = body

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Rows are required' } }, { status: 400 })
    }

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    // Batch insert members
    const { data, error } = await supabase
      .from('members')
      .insert(rows.map((r: Record<string, unknown>) => ({
        gym_id: gym.id,
        owner_id: user.id,
        name: String((r.name as string) ?? '').trim().slice(0, 255),
        phone: String((r.phone as string) ?? '').replace(/\D/g, '').slice(0, 15),
        age: parseInt(r.age as string) || null,
        gender: ['male', 'female', 'other'].includes(r.gender as string) ? r.gender : null,
        area: r.area ? String(r.area as string).slice(0, 100) : null,
        member_number: parseInt(r.member_number as string),
        legacy_member_id: r.legacy_member_id ? String(r.legacy_member_id as string).slice(0, 50) : null,
      })))
      .select('id')

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    return NextResponse.json({
      success: true,
      data: { imported_count: data?.length ?? 0 },
      meta: { duration_ms: Date.now() - startTime }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
