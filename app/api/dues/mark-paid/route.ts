import { NextRequest, NextResponse } from 'next/server'
import { withAuth, isValidUUID } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dues/mark-paid
 *
 * Mark a member's pending amount as fully paid (set to 0).
 *
 * Body: { member_id }
 */
export const POST = withAuth('DUES_MARK_PAID', async (req: NextRequest, { supabase, gym }) => {
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
    .single()

  if (!member || member.gym_id !== gym.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Member does not belong to your gym' } },
      { status: 403 }
    )
  }

  const { error } = await supabase
    .from('members')
    .update({ pending_amount: 0 })
    .eq('id', member_id)

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  await Promise.all([
    deleteCache(cacheKeys.membersList(gym.id)),
    deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
  ])

  return NextResponse.json(
    { success: true, data: { member_id } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
