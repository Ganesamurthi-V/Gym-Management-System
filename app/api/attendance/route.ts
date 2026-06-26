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

    const { allowed } = await checkRateLimit(user.id, '/api/attendance', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    const { member_id, date, status } = body

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    // Verify the member belongs to this gym before marking attendance
    const { data: member } = await supabase.from('members').select('gym_id').eq('id', member_id).single()
    if (!member || member.gym_id !== gym.id) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized member access' } }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        { member_id, date, gym_id: gym.id },
        { onConflict: 'member_id,date' }
      )
      .select('id')
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    return NextResponse.json({ success: true, data, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
