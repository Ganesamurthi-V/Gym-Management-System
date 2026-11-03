import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { todayIST } from '@/lib/utils'
import { apiLogger } from '@/lib/logger'
import { memberCapReached, MEMBER_CAP_MESSAGE } from '@/lib/subscription-utils'

export const dynamic = 'force-dynamic'

import { claimIdempotencyKey } from '@/lib/api/idempotency'
import { recordOwnerAction } from '@/lib/activity/record'
import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError, passesCsrf, csrfRejected, boundedInt, boundedText, MAX_MONEY } from '@/app/api/_guard'
import { assertGymWritable } from '@/lib/subscriptionGuard'
function planMemberLimitResponse() {
  return NextResponse.json(
    { success: false, error: { code: 'PLAN_MEMBER_LIMIT', message: MEMBER_CAP_MESSAGE } },
    { status: 403 },
  )
}

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

    // Reads are refused too: a lapsed or banned owner must not keep exporting member data.
    const readOnly = assertGymWritable(gym)
    if (readOnly) { log.summary(403); return readOnly }

    const { searchParams } = req.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50') || 50, 1), 100)
    const offset = Math.min(Math.max(parseInt(searchParams.get('offset') ?? '0') || 0, 0), 1_000_000)

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
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid body' } }, { status: 400 })
    }
    const name = boundedText(body.name, 100) ?? ''
    const phone = boundedText(body.phone, 20) ?? ''
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

    const age = boundedInt(body.age, 0, 120)
    const member_number = boundedInt(body.member_number, 1, 1_000_000_000)
    if (age === null || member_number === null) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Age and member_number must be integers' } }, { status: 400 })
    }

    // Opening due entered on the add-member form. The Dues page, dashboard and reports all read
    // members.pending_amount, and nothing derives it from memberships.due_amount, so dropping it
    // here made a new member with a due show as zero dues everywhere.
    const pending_amount = body.pending_amount === undefined || body.pending_amount === null || body.pending_amount === ''
      ? 0
      : boundedInt(body.pending_amount, 0, MAX_MONEY)
    if (pending_amount === null) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'pending_amount must be a non-negative integer' } }, { status: 400 })
    }

    // Optional date_of_birth — powers the birthday_wishes WhatsApp automation.
    let date_of_birth: string | null = null
    if (body.date_of_birth !== undefined && body.date_of_birth !== null && body.date_of_birth !== '') {
      const dob = String(body.date_of_birth).slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(Date.parse(dob))) {
        log.summary(400)
        return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'date_of_birth must be YYYY-MM-DD' } }, { status: 400 })
      }
      date_of_birth = dob
    }

    log.start('GET_GYM')
    const gym = await getGymForUser(supabase, user.id)
    log.end('GET_GYM')

    if (!gym) {
      log.summary(404)
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    }
    log.info('Gym Info', { gymId: gym.id })
    const readOnly = assertGymWritable(gym)
    if (readOnly) return readOnly

    // Double-tap guard, claimed after validation so a 400 does not burn the key.
    const duplicate = await claimIdempotencyKey(req, gym.id, 'members')
    if (duplicate) return duplicate

    // Trial and Free gyms hold at most 50 members. Plan and count come from the DB for the
    // server-resolved gym (never the body); paid gyms skip the count query. The DB trigger is the
    // real guard, this just answers before touching the insert.
    const { data: planRow } = await supabase.from('gyms').select('plan_type').eq('id', gym.id).single()
    if (planRow?.plan_type === 'trial' || planRow?.plan_type === 'free') {
      const { count, error: countErr } = await supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('gym_id', gym.id)
      if (!countErr && memberCapReached(planRow.plan_type, count ?? 0)) {
        log.summary(403)
        return planMemberLimitResponse()
      }
    }

    log.start('DB_INSERT')
    const { data, error } = await supabase
      .from('members')
      .insert({
        name,
        phone,
        age,
        gender,
        date_of_birth,
        member_number,
        pending_amount,
        gym_id: gym.id
      })
      .select('id, name, phone, member_number')
      .single()
    log.end('DB_INSERT')

    if (error) {
      // The DB trigger is the real cap (a concurrent add can lose the race): same plain upgrade message.
      if (error.code === '23514' && error.message?.includes('member_limit')) {
        log.summary(403)
        return planMemberLimitResponse()
      }
      const mapped = mapSupabaseError(error)
      log.error('DB insert failed', error)
      log.summary(mapped.status)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    await deleteCache(cacheKeys.dashboard(gym.id, todayIST()))

    log.summary(201)
    recordOwnerAction(supabase, req, 'MEMBERS_CREATE')
    return NextResponse.json({ success: true, data, meta: { request_id: log.requestId } })
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/members', err)
    log.summary(500)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}
