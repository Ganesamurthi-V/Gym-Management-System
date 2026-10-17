import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'

import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError, passesCsrf, csrfRejected, UUID_RE, isIsoDate, boundedInt, boundedText, MAX_MONEY } from '@/app/api/_guard'
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
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50') || 50, 1), 100)

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
      .select('id, member_id, plan, amount, start_date, end_date, created_at, members!fk_memberships_member_same_gym(name)')
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

    // Not logged: rows carry member names (PII).
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
    if (!passesCsrf(req)) return csrfRejected()
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

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid body' } }, { status: 400 })
    }

    const amount = boundedInt(body.amount, 0, MAX_MONEY)
    if (amount === null) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Amount must be a non-negative integer' } }, { status: 400 })
    }

    const plan = boundedText(body.plan, 100)
    if (typeof body.member_id !== 'string' || !UUID_RE.test(body.member_id) || !plan ||
        !isIsoDate(body.start_date) || !isIsoDate(body.end_date) || body.end_date < body.start_date) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Valid member_id, plan, start_date and end_date are required' } }, { status: 400 })
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

    // The composite FK would also reject a foreign member, but check up front
    // so the caller gets a clean 403 and no insert is attempted.
    const { data: memberRow } = await supabase
      .from('members')
      .select('id')
      .eq('id', body.member_id)
      .eq('gym_id', gym.id)
      .maybeSingle()
    if (!memberRow) {
      log.summary(403)
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Member does not belong to your gym' } }, { status: 403 })
    }

    log.start('DB_INSERT')
    const { data, error } = await supabase
      .from('memberships')
      .insert({
        member_id: body.member_id,
        gym_id: gym.id,
        plan,
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
