import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/support/sync
 *
 * Returns all admin_messages and support_tickets for the authenticated user's gym.
 * Used by SupportTabsClient's realtime sync callback.
 */
export const GET = withAuth('SUPPORT_SYNC', async (req: NextRequest, { supabase, gym }) => {
  const [messagesResult, ticketsResult] = await Promise.all([
    supabase
      .from('admin_messages')
      .select('*')
      .eq('gym_id', gym.id)
      .eq('is_cleared_by_owner', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('support_tickets')
      .select('*')
      .eq('gym_id', gym.id)
      .eq('is_cleared_by_owner', false)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json(
    {
      success: true,
      data: {
        messages: messagesResult.data ?? [],
        tickets: ticketsResult.data ?? [],
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
