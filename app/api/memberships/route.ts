import { NextRequest, NextResponse } from 'next/server'
import { withAuth, isValidUUID } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

/**
 * POST /api/memberships
 *
 * Create a new membership (renewal or initial).
 * Server verifies the member belongs to the authenticated user's gym.
 */
export const POST = withAuth('MEMBERSHIPS_POST', async (req: NextRequest, { supabase, gym }) => {
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
    .single()

  if (!memberCheck || memberCheck.gym_id !== gym.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Member does not belong to your gym' } },
      { status: 403 }
    )
  }

  // Validate required fields
  const plan = body.plan as string
  const start_date = body.start_date as string
  const end_date = body.end_date as string
  const amount = parseInt(String(body.amount))

  if (!plan || !start_date || !end_date) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'plan, start_date, and end_date are required' } },
      { status: 400 }
    )
  }

  if (isNaN(amount) || amount < 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'amount must be a non-negative integer' } },
      { status: 400 }
    )
  }

  // Validate date formats
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Dates must be YYYY-MM-DD format' } },
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
  if (body.payment_mode) insertData.payment_mode = body.payment_mode
  if (body.category) insertData.category = body.category
  if (body.admission_fee !== undefined) insertData.admission_fee = parseInt(String(body.admission_fee)) || 0
  if (body.due_amount !== undefined) insertData.due_amount = parseInt(String(body.due_amount)) || 0

  const { data, error } = await supabase
    .from('memberships')
    .insert(insertData)
    .select('id, member_id, plan, amount, start_date, end_date')
    .single()

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
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
