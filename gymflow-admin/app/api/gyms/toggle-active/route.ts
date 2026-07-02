import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { apiLogger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const log = apiLogger('ADMIN_TOGGLE_ACTIVE', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'toggle_active', 10, 60)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  try {
    const { gymId, isActive } = await req.json()

    if (!gymId || typeof isActive !== 'boolean') {
      log.summary(400)
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    const cleanGymId = sanitizeUUID(gymId)
    if (!cleanGymId) {
      log.summary(400)
      return NextResponse.json({ error: 'Invalid gym ID' }, { status: 400 })
    }

    log.adminAction = isActive ? 'activate_gym' : 'ban_gym'

    log.start('DB_GET_GYM')
    const supabase = createAdminClient()
    const { data: gym, error: gymErr } = await supabase.from('gyms').select('owner_id').eq('id', cleanGymId).single()
    log.end('DB_GET_GYM')

    if (gymErr || !gym) {
      log.warn('Gym not found for toggle-active', { gymId: cleanGymId })
      log.summary(404)
      return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
    }

    log.start('DB_UPDATE_GYM')
    const { error: updateErr } = await supabase.from('gyms').update({ is_active: isActive }).eq('id', cleanGymId)
    log.end('DB_UPDATE_GYM')
    if (updateErr) throw updateErr

    log.start('AUTH_BAN_USER')
    const { error: banErr } = await supabase.auth.admin.updateUserById(gym.owner_id, {
      ban_duration: isActive ? 'none' : '876000h'
    })
    log.end('AUTH_BAN_USER')
    if (banErr) throw banErr

    log.info(`Gym ${isActive ? 'activated' : 'banned'}`, { gymId: cleanGymId })
    log.summary(200)
    return NextResponse.json({ success: true, isActive })
  } catch (error: unknown) {
    log.error('Failed to toggle gym active status', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to update gym status' }, { status: 500 })
  }
}
