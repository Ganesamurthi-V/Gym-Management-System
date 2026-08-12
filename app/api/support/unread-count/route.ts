import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/support/unread-count
 *
 * Returns the unread admin_messages count for the authenticated user's gym.
 */
export const GET = withAuth('SUPPORT_UNREAD_COUNT', async (req: NextRequest, { supabase, gym }) => {
  const { count, error } = await supabase
    .from('admin_messages')
    .select('*', { count: 'exact', head: true })
    .eq('gym_id', gym.id)
    .is('read_at', null)

  return NextResponse.json(
    { success: true, data: { count: count ?? 0 } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
