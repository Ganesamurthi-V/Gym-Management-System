import { NextRequest, NextResponse } from 'next/server'
import { withAuth, isValidUUID } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dues/collect
 *
 * Collect a due payment from a member. Updates member's pending_amount
 * and records a due_payment entry.
 *
 * Body: { member_id, amount, payment_mode }
 */
export const POST = withAuth('DUES_COLLECT', async (req: NextRequest, { supabase, gym }) => {
  let body: { member_id?: string; amount?: number; payment_mode?: string }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const { member_id, amount, payment_mode } = body

  if (!member_id || !isValidUUID(member_id)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Valid member_id is required' } },
      { status: 400 }
    )
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'amount must be a positive number' } },
      { status: 400 }
    )
  }

  if (!payment_mode || !['cash', 'upi', 'card'].includes(payment_mode)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'payment_mode must be cash, upi, or card' } },
      { status: 400 }
    )
  }

  // Verify member belongs to this gym and get current pending_amount
  const { data: member } = await supabase
    .from('members')
    .select('id, pending_amount, gym_id')
    .eq('id', member_id)
    .single()

  if (!member || member.gym_id !== gym.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Member does not belong to your gym' } },
      { status: 403 }
    )
  }

  const collect = Math.min(amount, member.pending_amount ?? 0)
  const newPending = (member.pending_amount ?? 0) - collect

  // Update member pending amount
  const { error: updateError } = await supabase
    .from('members')
    .update({ pending_amount: newPending })
    .eq('id', member_id)

  if (updateError) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: updateError.message } },
      { status: 500 }
    )
  }

  // Record the due payment
  await supabase.from('due_payments').insert({
    gym_id: gym.id,
    member_id,
    amount: collect,
    payment_mode,
  })

  // Bust caches
  await Promise.all([
    deleteCache(cacheKeys.membersList(gym.id)),
    deleteCache(cacheKeys.payments12mo(gym.id)),
    deleteCache(cacheKeys.paymentsAll(gym.id)),
    deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
  ])

  return NextResponse.json(
    { success: true, data: { collected: collect, new_pending: newPending } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
