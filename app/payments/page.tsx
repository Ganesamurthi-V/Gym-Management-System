import { createClient } from '@/lib/supabase/server'
import { PaymentsClient } from './PaymentsClient'
import { format, startOfMonth, endOfMonth } from 'date-fns'

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  // Get recent payments (last 50)
  const { data: payments } = await supabase
    .from('memberships')
    .select(`*, member:members(name, phone)`)
    .eq('gym_id', gym.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // This month's revenue
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: monthPayments } = await supabase
    .from('memberships')
    .select('amount, payment_mode')
    .eq('gym_id', gym.id)
    .gte('start_date', monthStart)
    .lte('start_date', monthEnd)

  const monthRevenue = (monthPayments ?? []).reduce((sum, p) => sum + p.amount, 0)
  const cashRevenue = (monthPayments ?? []).filter(p => p.payment_mode === 'cash').reduce((sum, p) => sum + p.amount, 0)
  const upiRevenue = (monthPayments ?? []).filter(p => p.payment_mode === 'upi').reduce((sum, p) => sum + p.amount, 0)

  return (
    <PaymentsClient
      payments={payments ?? []}
      gymId={gym.id}
      monthRevenue={monthRevenue}
      cashRevenue={cashRevenue}
      upiRevenue={upiRevenue}
    />
  )
}
