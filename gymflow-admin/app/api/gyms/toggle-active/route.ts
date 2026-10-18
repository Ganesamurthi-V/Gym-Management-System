import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeUUID } from '@/lib/sanitize'
import { apiLogger } from '@/lib/logger'
import { setGymActive } from '@/lib/gym-active'

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

    if (typeof gymId !== 'string' || typeof isActive !== 'boolean') {
      log.summary(400)
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    const cleanGymId = sanitizeUUID(gymId)
    if (!cleanGymId) {
      log.summary(400)
      return NextResponse.json({ error: 'Invalid gym ID' }, { status: 400 })
    }

    log.adminAction = isActive ? 'activate_gym' : 'ban_gym'

    log.start('SET_GYM_ACTIVE')
    const found = await setGymActive(createAdminClient(), cleanGymId, isActive)
    log.end('SET_GYM_ACTIVE')

    if (!found) {
      log.warn('Gym not found for toggle-active', { gymId: cleanGymId })
      log.summary(404)
      return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
    }

    log.info(`Gym ${isActive ? 'activated' : 'banned'}`, { gymId: cleanGymId })
    log.summary(200)
    return NextResponse.json({ success: true, isActive })
  } catch (error: unknown) {
    log.error('Failed to toggle gym active status', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to update gym status' }, { status: 500 })
  }
}
