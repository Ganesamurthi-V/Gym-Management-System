import { createClient } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export const revalidate = 300 // revalidate every 5 minutes

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  const today = format(new Date(), 'yyyy-MM-dd')

  // Run all 6 month queries + member status query in parallel
  const monthRanges = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), i)
    return {
      label: format(date, 'MMMM yyyy'),
      start: format(startOfMonth(date), 'yyyy-MM-dd'),
      end: format(endOfMonth(date), 'yyyy-MM-dd'),
    }
  })

  const [monthResults, allMemberships] = await Promise.all([
    Promise.all(
      monthRanges.map(({ start, end }) =>
        supabase
          .from('memberships')
          .select('amount, payment_mode, member_id')
          .eq('gym_id', gym.id)
          .gte('start_date', start)
          .lte('start_date', end)
      )
    ),
    supabase
      .from('memberships')
      .select('member_id, end_date')
      .eq('gym_id', gym.id)
      .order('created_at', { ascending: false }),
  ])

  const months = monthRanges.map(({ label }, i) => {
    const data = monthResults[i].data ?? []
    return {
      label,
      total: data.reduce((s, m) => s + m.amount, 0),
      cash:  data.filter(m => m.payment_mode === 'cash').reduce((s, m) => s + m.amount, 0),
      upi:   data.filter(m => m.payment_mode === 'upi').reduce((s, m) => s + m.amount, 0),
      card:  data.filter(m => m.payment_mode === 'card').reduce((s, m) => s + m.amount, 0),
      transactions: data.length,
      members: new Set(data.map(m => m.member_id)).size,
    }
  })

  // Latest membership per member
  const latestByMember = new Map<string, string>()
  for (const m of allMemberships.data ?? []) {
    if (!latestByMember.has(m.member_id)) latestByMember.set(m.member_id, m.end_date)
  }

  const expiredCount = Array.from(latestByMember.values()).filter(d => d < today).length
  const activeCount  = Array.from(latestByMember.values()).filter(d => d >= today).length

  return <ReportsClient months={months} expiredCount={expiredCount} activeCount={activeCount} />
}
