import { createClient } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export const revalidate = 300

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Select only the base columns that are guaranteed to exist.
  // Optional profile columns (city, gst_number, phone) are fetched separately
  // so a missing migration doesn't silently return null and blank the page.
  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()

  if (!gym) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <p className="text-2xl font-bold text-slate-300">No gym found</p>
        <p className="text-sm text-slate-400">Set up your gym profile first to see reports.</p>
      </div>
    )
  }

  // Fetch optional profile columns separately — gracefully ignore if missing
  const { data: gymProfile } = await supabase
    .from('gyms')
    .select('city, gst_number, phone')
    .eq('id', gym.id)
    .single()
    .then(r => r.error ? { data: null } : r)

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
    inventorySalesResults,
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
      .order('end_date', { ascending: false }),
    supabase
      .from('members')
      .select('id, name, phone, gender, age, area, pending_amount, created_at')
      .eq('gym_id', gym.id),
    supabase
      .from('attendance')
      .select('date')
      .eq('gym_id', gym.id)
      .gte('date', format(subMonths(new Date(), 3), 'yyyy-MM-dd')),
    Promise.all(
      monthRanges.map(({ start, end }) =>
        supabase
          .from('inventory_sales')
          .select('total_price, quantity, product_name, variant_name, payment_mode, sold_at')
          .eq('gym_id', gym.id)
          .gte('sold_at', start)
          .lte('sold_at', end + 'T23:59:59')
      )
    ),
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

  // Inventory sales monthly
  const inventorySales = monthRanges.map(({ label }, i) => {
    const data = inventorySalesResults[i].data ?? []
    return {
      label,
      total: data.reduce((s, sale) => s + Number(sale.total_price), 0),
      quantity: data.reduce((s, sale) => s + sale.quantity, 0),
    }
  })

  const recentInventorySales = inventorySalesResults
    .flatMap(r => r.data ?? [])
    .sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime())
    .slice(0, 20)

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
    .slice(0, 10) // Show more areas for better distribution view
    .map(([area, count]) => ({ area, count }))

  // Dues calculation
  const membersWithDues = members
    .filter(m => m.pending_amount > 0)
    .map(m => ({
      name: m.name,
      phone: m.phone,
      amount: m.pending_amount
    }))
  const totalDuesAmount = membersWithDues.reduce((sum, m) => sum + m.amount, 0)

  // Expiring memberships
  const expiringMembers = members.map(m => {
    const endDate = latestByMember.get(m.id)
    return {
      name: m.name,
      phone: m.phone,
      endDate: endDate || null,
      plan: planByMember.get(m.id) || 'None'
    }
  }).filter(m => m.endDate)
    .sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''))

  const attendanceTodayCount = (attendanceData.data ?? []).filter(a => a.date === today).length

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
      gymCity={gymProfile?.city ?? null}
      gymGST={gymProfile?.gst_number ?? null}
      gymPhone={gymProfile?.phone ?? null}
      membersWithDues={membersWithDues}
      totalDuesAmount={totalDuesAmount}
      expiringMembers={expiringMembers}
      attendanceTodayCount={attendanceTodayCount}
      gymId={gym.id}
      inventorySales={inventorySales}
      recentInventorySales={recentInventorySales}
    />
  )
}
