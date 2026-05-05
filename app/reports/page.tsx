import { createClient } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export default async function ReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  // Build last 3 months of data
  const months = []

  for (let i = 0; i < 3; i++) {
    const date = subMonths(new Date(), i)
    const monthStart = format(startOfMonth(date), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(date), 'yyyy-MM-dd')
    const monthLabel = format(date, 'MMMM yyyy')

    const { data: memberships } = await supabase
      .from('memberships')
      .select('amount, payment_mode, member_id, created_at')
      .eq('gym_id', gym.id)
      .gte('start_date', monthStart)
      .lte('start_date', monthEnd)

    const total = (memberships ?? []).reduce((sum, m) => sum + m.amount, 0)
    const cash = (memberships ?? []).filter(m => m.payment_mode === 'cash').reduce((sum, m) => sum + m.amount, 0)
    const upi = (memberships ?? []).filter(m => m.payment_mode === 'upi').reduce((sum, m) => sum + m.amount, 0)
    const card = (memberships ?? []).filter(m => m.payment_mode === 'card').reduce((sum, m) => sum + m.amount, 0)
    const uniqueMembers = new Set((memberships ?? []).map(m => m.member_id)).size

    months.push({
      label: monthLabel,
      total,
      cash,
      upi,
      card,
      transactions: (memberships ?? []).length,
      members: uniqueMembers,
    })
  }

  // Expired members
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: memberships } = await supabase
    .from('memberships')
    .select('member_id, end_date')
    .eq('gym_id', gym.id)
    .order('created_at', { ascending: false })

  const latestByMember = new Map<string, string>()
  for (const m of memberships ?? []) {
    if (!latestByMember.has(m.member_id)) {
      latestByMember.set(m.member_id, m.end_date)
    }
  }

  const expiredCount = Array.from(latestByMember.values()).filter(d => d < today).length
  const activeCount = Array.from(latestByMember.values()).filter(d => d >= today).length

  return (
    <ReportsClient
      months={months}
      expiredCount={expiredCount}
      activeCount={activeCount}
    />
  )
}
