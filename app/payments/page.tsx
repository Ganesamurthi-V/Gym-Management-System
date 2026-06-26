import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { cacheWrapper } from '@/lib/cache'
import { PaymentsClient } from './PaymentsClient'
import { subMonths, format } from 'date-fns'

export default async function PaymentsPage() {
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  const cacheKey = `gym:${gym.id}:payments_page:12mo`
  
  const data = await cacheWrapper(cacheKey, 60, async () => {
    const supabase = await createClient()
    
    const twelveMonthsAgo = format(subMonths(new Date(), 12), 'yyyy-MM-dd')

    let paymentsQuery = supabase
      .from('memberships')
      .select('*, member:members(id, name, phone, member_number)')
      .eq('gym_id', gym.id)
      .gte('created_at', twelveMonthsAgo)
      .order('created_at', { ascending: false })

    let salesQuery = supabase
      .from('inventory_sales')
      .select('*')
      .eq('gym_id', gym.id)
      .gte('sold_at', twelveMonthsAgo)
      .order('sold_at', { ascending: false })

    const [paymentsRes, productSalesRes, pendingMembersRes] = await Promise.all([
      paymentsQuery,
      salesQuery,
      supabase
        .from('members')
        .select('id, name, phone, member_number, pending_amount')
        .eq('gym_id', gym.id)
        .gt('pending_amount', 0)
        .order('pending_amount', { ascending: false })
    ])

    return {
      payments: paymentsRes.data ?? [],
      productSales: productSalesRes.data ?? [],
      pendingMembers: pendingMembersRes.data ?? []
    }
  })

  return (
    <PaymentsClient
      payments={data.payments}
      productSales={data.productSales}
      pendingMembers={data.pendingMembers}
      gymId={gym.id}
      gymName={gym.name}
    />
  )
}
