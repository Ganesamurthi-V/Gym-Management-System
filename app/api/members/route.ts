import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
export async function GET(req: NextRequest) {
  const log = apiLogger('MEMBERS_API_GET')
  try {
    log.start('AUTH')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    log.end('AUTH')

    if (authError || !user) {
      log.summary(401)
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
    }
    log.info('User Info', { userId: user.id })

    const { allowed } = await checkRateLimit(user.id, '/api/members', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      log.summary(429)
      return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })
    }

    log.start('GET_GYM')
    const gym = await getGymForUser(supabase, user.id)
    log.end('GET_GYM')

    if (!gym) {
      log.summary(404)
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    }
    log.info('Gym Info', { gymId: gym.id })

    const { searchParams } = req.nextUrl
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
    const offset = parseInt(searchParams.get('offset') ?? '0')

    log.start('DB_QUERY')
    const { data, error, count } = await supabase
      .from('members')
      .select('id, name, phone, age, gender, member_number, legacy_member_id, created_at', { count: 'exact' })
      .eq('gym_id', gym.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    log.end('DB_QUERY')

    if (error) {
      const mapped = mapSupabaseError(error)
      log.error('DB select failed', error)
      log.summary(mapped.status)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    // Security: do not log `data` — member records contain PII (names, phones).
    log.info('Payload ready', { returned: data?.length ?? 0, count })
    log.summary(200)
    return NextResponse.json({
      success: true,
      data,
      meta: {
        request_id: log.requestId,
        total_count: count,
        has_more: (count ?? 0) > (offset + limit)
      }
    })
  } catch (err: unknown) {
    log.error('Unhandled exception in GET /api/members', err)
    log.summary(500)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const log = apiLogger('MEMBERS_API_POST')
  try {
    log.start('AUTH')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    log.end('AUTH')

    if (authError || !user) {
      log.summary(401)
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
    }
    log.info('User Info', { userId: user.id })

    // Security: rate-limit writes to match the GET handler and the [id] routes.
    // Without this, POST was the one unthrottled entry point for member creation.
    const { allowed } = await checkRateLimit(user.id, '/api/members', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      log.summary(429)
      return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })
    }

    let body
    try { body = await req.json() } catch {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 })
    }

    // Security: validate/normalize required fields before insert. Previously
    // `name`/`phone` were written straight through (empty or wrong-typed values
    // could be persisted) and `gender` was never checked against the DB constraint.
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!name || !phone) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Name and phone are required' } }, { status: 400 })
    }

    let gender: string | null = null
    if (body.gender !== undefined && body.gender !== null && body.gender !== '') {
      if (!['male', 'female', 'other'].includes(body.gender)) {
        log.summary(400)
        return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid gender' } }, { status: 400 })
      }
      gender = body.gender
    }

    const age = parseInt(body.age)
    const member_number = parseInt(body.member_number)
    if (isNaN(age) || isNaN(member_number)) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Age and member_number must be integers' } }, { status: 400 })
    }

    log.start('GET_GYM')
    const gym = await getGymForUser(supabase, user.id)
    log.end('GET_GYM')

    if (!gym) {
      log.summary(404)
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    }
    log.info('Gym Info', { gymId: gym.id })

    log.start('DB_INSERT')
    const { data, error } = await supabase
      .from('members')
      .insert({
        name,
        phone,
        age,
        gender,
        member_number,
        gym_id: gym.id
      })
      .select('id, name, phone, member_number')
      .single()
    log.end('DB_INSERT')

    if (error) {
      const mapped = mapSupabaseError(error)
      log.error('DB insert failed', error)
      log.summary(mapped.status)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    await Promise.all([
      deleteCache(cacheKeys.membersList(gym.id)),
      deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
    ])

    log.summary(201)
    return NextResponse.json({ success: true, data, meta: { request_id: log.requestId } })
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/members', err)
    log.summary(500)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}
