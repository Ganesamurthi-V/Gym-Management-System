import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/expiring?period=month
 *
 * Returns members with memberships expiring in the specified period.
 */
export const GET = withAuth('DASHBOARD_EXPIRING', async (req: NextRequest, { supabase, gym }) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const currentMonth = todayStr.slice(0, 7)
  const monthStart = `${currentMonth}-01`
  const monthEnd = `${currentMonth}-31`

  const { data: membershipsData, error } = await supabase
    .from('memberships')
    .select('member_id, end_date, member:members(id, name, phone, member_number)')
    .eq('gym_id', gym.id)
    .gte('end_date', monthStart)
    .lte('end_date', monthEnd)
    .order('end_date', { ascending: true })

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  const memberMap = new Map<string, unknown>()
  for (const m of membershipsData ?? []) {
    if (!m.member || memberMap.has(m.member_id)) continue
    const daysRemaining = Math.ceil((new Date(m.end_date).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24))
    memberMap.set(m.member_id, { ...(m.member as any), latest_membership: m, days_remaining: daysRemaining })
  }

  const result = Array.from(memberMap.values()).sort((a: any, b: any) => a.days_remaining - b.days_remaining)

  return NextResponse.json(
    { success: true, data: result },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
