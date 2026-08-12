import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

/**
 * POST /api/members/fix-duplicates
 *
 * Accepts an array of { id, newNum } updates to fix duplicate member numbers.
 * Server re-validates that all IDs belong to the authenticated user's gym.
 */
export const POST = withAuth('MEMBERS_FIX_DUPLICATES', async (req: NextRequest, { supabase, gym }) => {
  let body: { updates?: { id: string; newNum: number }[] }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const updates = body.updates
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'updates array is required' } },
      { status: 400 }
    )
  }

  if (updates.length > 500) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Too many updates (max 500)' } },
      { status: 400 }
    )
  }

  // Validate all entries
  for (const u of updates) {
    if (!u.id || typeof u.id !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Each update must have a string id' } },
        { status: 400 }
      )
    }
    if (typeof u.newNum !== 'number' || u.newNum < 1) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Each update must have a positive newNum' } },
        { status: 400 }
      )
    }
  }

  // Batch update — all must belong to this gym (RLS enforces this, but we add explicit check)
  const results = await Promise.all(
    updates.map(({ id, newNum }) =>
      supabase
        .from('members')
        .update({ member_number: newNum })
        .eq('id', id)
        .eq('gym_id', gym.id)
    )
  )

  const failed = results.filter(r => r.error)
  if (failed.length > 0) {
    return NextResponse.json(
      { success: false, error: { code: 'PARTIAL_FAILURE', message: `${failed.length} of ${updates.length} updates failed` } },
      { status: 207 }
    )
  }

  await deleteCache(cacheKeys.membersList(gym.id))
  await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))

  return NextResponse.json({ success: true, data: { updated: updates.length } })
})
