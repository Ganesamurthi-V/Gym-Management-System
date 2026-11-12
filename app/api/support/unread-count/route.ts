import { NextRequest, NextResponse } from 'next/server'
import { withAuth, apiError } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/support/unread-count
 *
 * Returns the unread admin_messages count for the authenticated user's gym.
 */
export const GET = withAuth('SUPPORT_UNREAD_COUNT', async (_req: NextRequest, { supabase, gym, log }) => {
  const { count, error } = await supabase
    .from('admin_messages')
    .select('*', { count: 'exact', head: true })
    .eq('gym_id', gym.id)
    .is('read_at', null)

  if (error) {
    log.error('unread count query failed', error)
    return apiError(500, 'INTERNAL_ERROR', 'Could not load unread count')
  }

  return NextResponse.json(
    { success: true, data: { count: count ?? 0 } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}, { allowWhenExpired: true }) // support badge in the account menu
