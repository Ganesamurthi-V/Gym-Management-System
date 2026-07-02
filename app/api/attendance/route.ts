import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'

import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'

export async function POST(req: NextRequest) {
  const log = apiLogger('ATTENDANCE_API_POST', req)
  try {
    log.start('AUTH')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    log.end('AUTH')

    if (authError || !user) {
      log.summary(401)
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
    }
    log.userId = user.id

    const { allowed } = await checkRateLimit(user.id, '/api/attendance', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      log.summary(429)
      return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })
    }

    let body
    try { body = await req.json() } catch {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 })
    }

    const { member_id, date, status } = body

    log.start('GET_GYM')
    const gym = await getGymForUser(supabase, user.id)
    log.end('GET_GYM')

    if (!gym) {
      log.summary(404)
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    }
    log.gymId = gym.id

    // Verify the member belongs to this gym before marking attendance
    log.start('MEMBER_CHECK')
    const { data: member } = await supabase.from('members').select('gym_id').eq('id', member_id).single()
    log.end('MEMBER_CHECK')

    if (!member || member.gym_id !== gym.id) {
      log.warn('Attendance attempt for member not in this gym', { member_id })
      log.summary(403)
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized member access' } }, { status: 403 })
    }

    log.start('DB_UPSERT')
    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        { member_id, date, gym_id: gym.id },
        { onConflict: 'member_id,date' }
      )
      .select('id')
      .single()
    log.end('DB_UPSERT')

    if (error) {
      const mapped = mapSupabaseError(error)
      log.error('DB upsert failed', error)
      log.summary(mapped.status)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    log.summary(200)
    return NextResponse.json({ success: true, data, meta: { request_id: log.requestId } })
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/attendance', err)
    log.summary(500)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}
