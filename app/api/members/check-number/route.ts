import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

export const GET = withAuth('MEMBERS_CHECK_NUMBER', async (req: NextRequest, { supabase, gym }) => {
  const num = parseInt(req.nextUrl.searchParams.get('number') ?? '')
  if (isNaN(num) || num < 1) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'number query param must be a positive integer' } },
      { status: 400 }
    )
  }

  const { data } = await supabase
    .from('members')
    .select('id')
    .eq('gym_id', gym.id)
    .eq('member_number', num)
    .maybeSingle()

  return NextResponse.json(
    { success: true, data: { exists: !!data } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
