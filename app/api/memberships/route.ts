import { NextRequest, NextResponse } from 'next/server'
import { withAuth, isValidUUID } from '@/lib/api/withAuth'
import { claimIdempotencyKey } from '@/lib/api/idempotency'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'
import { isIsoDate, boundedInt, boundedText, MAX_MONEY } from '@/app/api/_guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/memberships
 *
 * Create a new membership (renewal or initial).
 * Server verifies the member belongs to the authenticated user's gym.
 */
export const POST = withAuth('MEMBERSHIPS_POST', async (req: NextRequest, { supabase, gym, log }) => {
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const member_id = body.member_id as string
  if (!member_id || !isValidUUID(member_id)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Valid member_id is required' } },
      { status: 400 }
    )
  }

  // Verify member belongs to this gym
  const { data: memberCheck } = await supabase
    .from('members')
    .select('gym_id')
    .eq('id', member_id)
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (!memberCheck || memberCheck.gym_id !== gym.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Member does not belong to your gym' } },
      { status: 403 }
    )
  }

  // Validate required fields
  const plan = boundedText(body.plan, 100)
  const start_date = body.start_date
  const end_date = body.end_date
  const amount = boundedInt(body.amount, 0, MAX_MONEY)

  if (!plan || !start_date || !end_date) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'plan, start_date, and end_date are required' } },
      { status: 400 }
    )
  }

  if (amount === null) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'amount must be a non-negative integer' } },
      { status: 400 }
    )
  }

  // Validate date formats
  if (!isIsoDate(start_date) || !isIsoDate(end_date) || end_date < start_date) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Dates must be valid YYYY-MM-DD and end_date must not be before start_date' } },
      { status: 400 }
    )
  }

  const insertData: Record<string, unknown> = {
    member_id,
    gym_id: gym.id,
    plan,
    start_date,
    end_date,
    amount,
  }

  // Optional fields
  if (body.payment_mode) {
    if (typeof body.payment_mode !== 'string' || !['cash', 'upi', 'card'].includes(body.payment_mode)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'payment_mode must be cash, upi, or card' } },
        { status: 400 }
      )
    }
    insertData.payment_mode = body.payment_mode
  }
  if (body.category) {
    const category = boundedText(body.category, 50)
    if (!category) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid category' } },
        { status: 400 }
      )
    }
    insertData.category = category
  }
  // Negative fees/dues would corrupt revenue and pending totals.
  if (body.admission_fee !== undefined) {
    const fee = boundedInt(body.admission_fee, 0, MAX_MONEY)
    if (fee === null) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'admission_fee must be a non-negative integer' } },
        { status: 400 }
      )
    }
    insertData.admission_fee = fee
  }
  if (body.due_amount !== undefined) {
    const due = boundedInt(body.due_amount, 0, MAX_MONEY)
    if (due === null) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'due_amount must be a non-negative integer' } },
        { status: 400 }
      )
    }
    insertData.due_amount = due
  }

  // Double-tap guard: claimed only after validation so a 400 does not burn the key.
  const duplicate = await claimIdempotencyKey(req, gym.id, 'memberships')
  if (duplicate) return duplicate

  const { data, error } = await supabase
    .from('memberships')
    .insert(insertData)
    .select('id, member_id, plan, amount, start_date, end_date')
    .single()

  if (error) {
    log.error('Membership insert failed', error)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not save the membership. Please try again.' } },
      { status: 500 }
    )
  }

  await Promise.all([
    deleteCache(cacheKeys.membersList(gym.id)),
    deleteCache(cacheKeys.payments12mo(gym.id)),
    deleteCache(cacheKeys.paymentsAll(gym.id)),
    deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
  ])

  return NextResponse.json(
    { success: true, data },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
  )
})
