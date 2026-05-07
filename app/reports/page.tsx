import { createClient } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export const revalidate = 300

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  const today = format(new Date(), 'yyyy-MM-dd')

  const monthRanges = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), i)
    return {
      label: format(d, 'MMM yyyy'),
      start: format(startOfMonth(d), 'yyyy-MM-dd'),
      end:   format(endOfMonth(d),   'yyyy-MM-dd'),
    }
  })

  const [
    monthResults,
    allMemberships,
    allMembers,
    attendanceData,
  ] = await Promise.all([
    Promise.all(
      monthRanges.map(({ start, end }) =>
        supabase
          .from('memberships')
          .select('amount, admission_fee, payment_mode, member_id')
          .eq('gym_id', gym.id)
          .gte('start_date', start)
          .lte('start_date', end)
      )
    ),
    supabase
      .from('memberships')
      .select('member_id, end_date, plan')
      .eq('gym_id', gym.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('members')
      .select('id, gender, age, area, created_at')
      .eq('gym_id', gym.id),
    supabase
      .from('attendance')
      .select('date')
      .eq('gym_id', gym.id)
      .gte('date', format(subMonths(new Date(), 3), 'yyyy-MM-dd')),
  ])

  // Monthly revenue
  const months = monthRanges.map(({ label }, i) => {
    const data = monthResults[i].data ?? []
    return {
      label,
      total: data.reduce((s, m) => s + m.amount + (m.admission_fee ?? 0), 0),
      cash:  data.filter(m => m.payment_mode === 'cash').reduce((s, m) => s + m.amount + (m.admission_fee ?? 0), 0),
      upi:   data.filter(m => m.payment_mode === 'upi').reduce((s, m)  => s + m.amount + (m.admission_fee ?? 0), 0),
      card:  data.filter(m => m.payment_mode === 'card').reduce((s, m) => s + m.amount + (m.admission_fee ?? 0), 0),
      transactions: data.length,
      newMembers: new Set(data.map(m => m.member_id)).size,
    }
  })

  // Member status
  const latestByMember = new Map<string, string>()
  const planByMember   = new Map<string, string>()
  for (const m of allMemberships.data ?? []) {
    if (!latestByMember.has(m.member_id)) {
      latestByMember.set(m.member_id, m.end_date)
      planByMember.set(m.member_id, m.plan)
    }
  }
  const expiredCount = Array.from(latestByMember.values()).filter(d => d < today).length
  const activeCount  = Array.from(latestByMember.values()).filter(d => d >= today).length

  // Plan distribution
  const planCounts = { monthly: 0, quarterly: 0, annual: 0 }
  for (const plan of planByMember.values()) {
    if (plan in planCounts) planCounts[plan as keyof typeof planCounts]++
  }

  // Gender breakdown
  const members = allMembers.data ?? []
  const genderCounts = {
    male:   members.filter(m => m.gender === 'male').length,
    female: members.filter(m => m.gender === 'female').length,
    other:  members.filter(m => m.gender === 'other').length,
    unknown: members.filter(m => !m.gender).length,
  }

  // Age breakdown buckets
  const ageBuckets = { '<18': 0, '18-25': 0, '26-35': 0, '36-45': 0, '46+': 0, unknown: 0 }
  for (const m of members) {
    if (!m.age) { ageBuckets.unknown++; continue }
    if (m.age < 18)       ageBuckets['<18']++
    else if (m.age <= 25) ageBuckets['18-25']++
    else if (m.age <= 35) ageBuckets['26-35']++
    else if (m.age <= 45) ageBuckets['36-45']++
    else                  ageBuckets['46+']++
  }

  // New members per month (by created_at)
  const newMembersByMonth = monthRanges.map(({ label, start, end }) => ({
    label,
    count: members.filter(m => m.created_at >= start && m.created_at <= end + 'T23:59:59').length,
  }))

  // Churn: expired and no renewal in last 30 days
  const churnCount = expiredCount

  // Attendance by day of week (0=Sun … 6=Sat)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayCounts = [0, 0, 0, 0, 0, 0, 0]
  for (const a of attendanceData.data ?? []) {
    const day = new Date(a.date).getDay()
    dayCounts[day]++
  }
  const attendanceByDay = dayNames.map((name, i) => ({ name, count: dayCounts[i] }))

  // Top 5 areas
  const areaCounts: Record<string, number> = {}
  for (const m of members) {
    if (m.area) areaCounts[m.area] = (areaCounts[m.area] ?? 0) + 1
  }
  const topAreas = Object.entries(areaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([area, count]) => ({ area, count }))

  return (
    <ReportsClient
      months={months}
      expiredCount={expiredCount}
      activeCount={activeCount}
      totalMembers={members.length}
      planCounts={planCounts}
      genderCounts={genderCounts}
      ageBuckets={ageBuckets}
      newMembersByMonth={newMembersByMonth}
      churnCount={churnCount}
      attendanceByDay={attendanceByDay}
      topAreas={topAreas}
      gymName={gym.name}
    />
  )
}
