import { NextRequest, NextResponse } from 'next/server'
import { withAuth, isValidUUID } from '@/lib/api/withAuth'
import { claimIdempotencyKey } from '@/lib/api/idempotency'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { todayIST } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dues/mark-paid
 *
 * Mark a member's pending amount as fully paid (set to 0).
 *
 * Body: { member_id }
 */
export const POST = withAuth('DUES_MARK_PAID', async (req: NextRequest, { supabase, gym, log }) => {
  let body: { member_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const { member_id } = body

  if (!member_id || !isValidUUID(member_id)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Valid member_id is required' } },
      { status: 400 }
    )
  }

  // Verify member belongs to this gym
  const { data: member } = await supabase
    .from('members')
    .select('gym_id')
    .eq('id', member_id)
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (!member || member.gym_id !== gym.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Member does not belong to your gym' } },
      { status: 403 }
    )
  }

  // Double-tap guard: claimed only after validation so a 400 does not burn the key.
  const duplicate = await claimIdempotencyKey(req, gym.id, 'dues-mark-paid')
  if (duplicate) return duplicate

  const { error } = await supabase
    .from('members')
    .update({ pending_amount: 0 })
    .eq('id', member_id)
    .eq('gym_id', gym.id)

  if (error) {
    log.error('Could not mark dues paid', error)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not update the balance. Please try again.' } },
      { status: 500 }
    )
  }

  await deleteCache(cacheKeys.dashboard(gym.id, todayIST()))

  return NextResponse.json(
    { success: true, data: { member_id } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
