import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/daily-report
 *
 * Returns today's memberships (payments) and new members for the daily PDF report.
 */
export const GET = withAuth('DASHBOARD_DAILY_REPORT', async (req: NextRequest, { supabase, gym }) => {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [membershipsRes, newMembersRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('amount, admission_fee, payment_mode, plan, category, member:members(name, member_number)')
      .eq('gym_id', gym.id)
      .eq('start_date', today),
    supabase
      .from('members')
      .select('name, member_number, phone, area, gender')
      .eq('gym_id', gym.id)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lt('created_at', `${today}T23:59:59.999Z`),
  ])

  const payments = (membershipsRes.data ?? []).map((p: any) => ({
    memberName: p.member?.name ?? 'Unknown',
    memberNumber: p.member?.member_number ?? 0,
    plan: p.plan,
    category: p.category,
    amount: p.amount,
    admission_fee: p.admission_fee ?? 0,
    payment_mode: p.payment_mode,
  }))

  const newMembers = (newMembersRes.data ?? []).map((m: any) => ({
    name: m.name,
    memberNumber: m.member_number,
    phone: m.phone,
    area: m.area || '-',
    gender: m.gender || '-',
  }))

  return NextResponse.json(
    { success: true, data: { payments, newMembers, date: today } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
