import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { istToday } from '@/lib/gamification/periods'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/daily-report
 *
 * Returns today's memberships (payments) and new members for the daily PDF report.
 */
export const GET = withAuth('DASHBOARD_DAILY_REPORT', async (req: NextRequest, { supabase, gym, log }) => {
  // IST day, not the server's UTC day (Vercel runs in UTC, which would show the
  // wrong date for the first 5.5 hours of every Indian day).
  const today = istToday()
  const dayStartUtc = new Date(`${today}T00:00:00+05:30`).toISOString()
  const dayEndUtc = new Date(new Date(`${today}T00:00:00+05:30`).getTime() + 86_400_000).toISOString()

  const [membershipsRes, newMembersRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('amount, admission_fee, payment_mode, plan, category, member:members!fk_memberships_member_same_gym(name, member_number)')
      .eq('gym_id', gym.id)
      .eq('start_date', today),
    supabase
      .from('members')
      .select('name, member_number, phone, area, gender')
      .eq('gym_id', gym.id)
      .gte('created_at', dayStartUtc)
      .lt('created_at', dayEndUtc),
  ])

  if (membershipsRes.error || newMembersRes.error) {
    log.error('Daily report query failed', membershipsRes.error ?? newMembersRes.error)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not load the daily report. Please try again.' } },
      { status: 500 }
    )
  }

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
