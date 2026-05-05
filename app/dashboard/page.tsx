import { createClient } from '@/lib/supabase/server'
import { getMemberStatus, getDaysRemaining, buildWhatsAppLink, formatDate, formatCurrency } from '@/lib/utils'
import { DashboardClient } from './DashboardClient'
import type { MemberWithStatus } from '@/types'
import { format } from 'date-fns'

async function getDashboardData(gymId: string) {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  // Get all members with their latest membership
  const { data: memberships } = await supabase
    .from('memberships')
    .select(`
      *,
      member:members(*)
    `)
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })

  // Get today's attendance count
  const { count: todayAttendance } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('gym_id', gymId)
    .eq('date', today)

  // Build member status map (latest membership per member)
  const memberMap = new Map<string, MemberWithStatus>()

  if (memberships) {
    for (const m of memberships) {
      if (!m.member) continue
      if (!memberMap.has(m.member_id)) {
        const status = getMemberStatus(m.end_date)
        const daysRemaining = getDaysRemaining(m.end_date)
        memberMap.set(m.member_id, {
          ...m.member,
          latest_membership: m,
          status,
          days_remaining: daysRemaining,
        })
      }
    }
  }

  const allMembers = Array.from(memberMap.values())
  const activeMembers = allMembers.filter(m => m.status === 'active' || m.status === 'expiring')
  const expiringThisWeek = allMembers.filter(m => m.status === 'expiring')
  const expiredMembers = allMembers.filter(m => m.status === 'expired')

  return {
    stats: {
      total_active: activeMembers.length,
      expiring_this_week: expiringThisWeek.length,
      expired_count: expiredMembers.length,
      today_attendance: todayAttendance ?? 0,
    },
    expiringMembers: expiringThisWeek.sort((a, b) => a.days_remaining - b.days_remaining),
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Get gym for this user
  const { data: gym } = await supabase
    .from('gyms')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!gym) {
    return (
      <div className="p-4 pt-8">
        <div className="card p-6 text-center">
          <p className="text-gray-500">No gym found. Please contact support.</p>
        </div>
      </div>
    )
  }

  const { stats, expiringMembers } = await getDashboardData(gym.id)

  return (
    <DashboardClient
      gymName={gym.name}
      stats={stats}
      expiringMembers={expiringMembers}
      gymId={gym.id}
    />
  )
}
