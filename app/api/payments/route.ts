import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'

import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'


export async function GET(req: NextRequest) {
  const log = apiLogger('PAYMENTS_API_GET')
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

    const { searchParams } = req.nextUrl
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

    log.start('GET_GYM')
    const gym = await getGymForUser(supabase, user.id)
    log.end('GET_GYM')

    if (!gym) {
      log.summary(404)
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    }
    log.info('Gym Info', { gymId: gym.id })

    log.start('DB_QUERY')
    const { data, error } = await supabase
      .from('memberships')
      .select('id, member_id, plan, amount, start_date, end_date, created_at, members(name)')
      .order('created_at', { ascending: false })
      .limit(limit)
      .eq('gym_id', gym.id)
    log.end('DB_QUERY')

    if (error) {
      const mapped = mapSupabaseError(error)
      log.error('DB select failed', error)
      log.summary(mapped.status)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    log.info('Payload', { data })
    log.summary(200)
    return NextResponse.json({
      success: true,
      data,
      meta: { request_id: log.requestId, has_more: (data?.length ?? 0) >= limit }
    })
  } catch (err: unknown) {
    log.error('Unhandled exception in GET /api/payments', err)
    log.summary(500)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const log = apiLogger('PAYMENTS_API_POST')
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

    let body
    try { body = await req.json() } catch {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 })
    }

    const amount = parseInt(body.amount)
    if (isNaN(amount) || amount < 0) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Amount must be a non-negative integer' } }, { status: 400 })
    }

    const paymentMode = body.payment_mode
    if (!['cash', 'upi', 'card'].includes(paymentMode)) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid payment mode' } }, { status: 400 })
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
      .from('memberships')
      .insert({
        member_id: body.member_id,
        gym_id: gym.id,
        plan: body.plan,
        amount,
        start_date: body.start_date,
        end_date: body.end_date,
        payment_mode: paymentMode,
      })
      .select('id, member_id, plan, amount')
      .single()
    log.end('DB_INSERT')

    if (error) {
      const mapped = mapSupabaseError(error)
      log.error('DB insert failed', error)
      log.summary(mapped.status)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    await Promise.all([
      deleteCache(cacheKeys.payments12mo(gym.id)),
      deleteCache(cacheKeys.paymentsAll(gym.id)),
      deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
    ])

    log.summary(201)
    return NextResponse.json({ success: true, data, meta: { request_id: log.requestId } })
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/payments', err)
    log.summary(500)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}
