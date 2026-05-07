import { createClient } from '@/lib/supabase/server'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import { DashboardClient } from './DashboardClient'
import type { MemberWithStatus } from '@/types'
import { format } from 'date-fns'

async function getDashboardData(gymId: string) {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [membershipsRes, attendanceRes, todayPaymentsRes, duesRes] = await Promise.all([
    // Only select columns needed for status calculation and expiring list
    supabase
      .from('memberships')
      .select('member_id, end_date, member:members(id, name, phone, member_number)')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false }),
    supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('gym_id', gymId).eq('date', today),
    supabase.from('memberships').select('amount, admission_fee').eq('gym_id', gymId).eq('start_date', today),
    supabase.from('members').select('pending_amount').eq('gym_id', gymId),
  ])

  const memberMap = new Map<string, MemberWithStatus>()
  for (const m of membershipsRes.data ?? []) {
    if (!m.member || memberMap.has(m.member_id)) continue
    const status = getMemberStatus(m.end_date)
    const daysRemaining = getDaysRemaining(m.end_date)
    memberMap.set(m.member_id, { ...(m.member as any), latest_membership: m as any, status, days_remaining: daysRemaining })
  }

  const allMembers = Array.from(memberMap.values())
  const expiringThisWeek = allMembers.filter(m => m.status === 'expiring')

  const todayCollection = (todayPaymentsRes.data ?? []).reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
  const totalDues = (duesRes.data ?? []).reduce((s, m) => s + (m.pending_amount ?? 0), 0)

  return {
    stats: {
      total_active: allMembers.filter(m => m.status === 'active' || m.status === 'expiring').length,
      expiring_this_week: expiringThisWeek.length,
      expired_count: allMembers.filter(m => m.status === 'expired').length,
      today_attendance: attendanceRes.count ?? 0,
      today_collection: todayCollection,
      total_dues: totalDues,
    },
    expiringMembers: expiringThisWeek.sort((a, b) => a.days_remaining - b.days_remaining),
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase.from('gyms').select('*').eq('owner_id', user.id).single()
  if (!gym) {
    return (
      <div className="card p-6 text-center">
        <p className="text-gray-500">No gym found. Please contact support.</p>
      </div>
    )
  }

  const { stats, expiringMembers } = await getDashboardData(gym.id)

  return (
    <DashboardClient gymName={gym.name} stats={stats} expiringMembers={expiringMembers} gymId={gym.id} />
  )
}
