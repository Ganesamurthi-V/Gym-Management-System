import { createClient } from '@/lib/supabase/server'
import { PaymentsClient } from './PaymentsClient'

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  // All payments with member info — no limit, needed for accurate sparkline
  const { data: payments } = await supabase
    .from('memberships')
    .select('*, member:members(id, name, phone, member_number)')
    .eq('gym_id', gym.id)
    .order('created_at', { ascending: false })

  // Inventory sales
  const { data: productSales } = await supabase
    .from('inventory_sales')
    .select('*')
    .eq('gym_id', gym.id)
    .order('sold_at', { ascending: false })

  // Members with pending dues
  const { data: pendingMembers } = await supabase
    .from('members')
    .select('id, name, phone, member_number, pending_amount')
    .eq('gym_id', gym.id)
    .gt('pending_amount', 0)
    .order('pending_amount', { ascending: false })

  return (
    <PaymentsClient
      payments={payments ?? []}
      productSales={productSales ?? []}
      pendingMembers={pendingMembers ?? []}
      gymId={gym.id}
      gymName={gym.name}
    />
  )
}
