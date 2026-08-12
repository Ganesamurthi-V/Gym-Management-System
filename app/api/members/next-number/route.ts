import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

export const GET = withAuth('MEMBERS_NEXT_NUMBER', async (req: NextRequest, { supabase, gym }) => {
  const { data } = await supabase
    .from('members')
    .select('member_number')
    .eq('gym_id', gym.id)
    .order('member_number', { ascending: false })
    .limit(1)

  const last = data?.[0]?.member_number ?? 0
  return NextResponse.json(
    { success: true, data: { next_number: last + 1 } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
