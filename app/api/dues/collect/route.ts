import { NextRequest, NextResponse } from 'next/server'
import { withAuth, isValidUUID } from '@/lib/api/withAuth'
import { claimIdempotencyKey } from '@/lib/api/idempotency'
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
export const POST = withAuth('DUES_COLLECT', async (req: NextRequest, { supabase, gym, log }) => {
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

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
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
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (!member || member.gym_id !== gym.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Member does not belong to your gym' } },
      { status: 403 }
    )
  }

  const currentPending = member.pending_amount ?? 0
  const collect = Math.min(amount, currentPending)
  if (collect <= 0) {
    return NextResponse.json(
      { success: false, error: { code: 'NOTHING_DUE', message: 'This member has no pending amount' } },
      { status: 409 }
    )
  }
  const newPending = currentPending - collect

  // Double-tap guard: claimed only after validation so a 400 does not burn the key.
  const duplicate = await claimIdempotencyKey(req, gym.id, 'dues-collect')
  if (duplicate) return duplicate

  // Optimistic lock on the balance we just read: two simultaneous collections
  // would otherwise both subtract from the same starting value and one payment
  // would be recorded without reducing the dues.
  const { data: updated, error: updateError } = await supabase
    .from('members')
    .update({ pending_amount: newPending })
    .eq('id', member_id)
    .eq('gym_id', gym.id)
    .eq('pending_amount', currentPending)
    .select('id')

  if (updateError) {
    log.error('Could not update pending amount', updateError)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not record the payment. Please try again.' } },
      { status: 500 }
    )
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'CONFLICT', message: 'The balance changed. Reload and try again.' } },
      { status: 409 }
    )
  }

  // Record the due payment; if that fails put the balance back so dues and
  // the payment ledger never disagree.
  const { error: ledgerError } = await supabase.from('due_payments').insert({
    gym_id: gym.id,
    member_id,
    amount: collect,
    payment_mode,
  })
  if (ledgerError) {
    log.error('Could not record due payment; restoring balance', ledgerError)
    await supabase.from('members').update({ pending_amount: currentPending }).eq('id', member_id).eq('gym_id', gym.id)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not record the payment. Please try again.' } },
      { status: 500 }
    )
  }

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
