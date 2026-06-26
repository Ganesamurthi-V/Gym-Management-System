'use server'

import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'

export async function getAllTimePayments(gymId: string) {
  // Auth gate — MUST run before cache lookup.
  // cacheWrapper returns Redis data without re-running the Supabase query,
  // so an unauthenticated caller could receive a previously-cached payload
  // if the check were placed inside the wrapper instead.
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('id', gymId)
    .eq('owner_id', user.id)
    .single()
  if (!gym) throw new Error('Forbidden')

  const cacheKey = `gym:${gymId}:payments_page:allTime`

  return cacheWrapper(cacheKey, 300, async () => {
    const [paymentsRes, productSalesRes] = await Promise.all([
      supabase
        .from('memberships')
        .select('*, member:members(id, name, phone, member_number)')
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false }),
      supabase
        .from('inventory_sales')
        .select('*')
        .eq('gym_id', gymId)
        .order('sold_at', { ascending: false })
    ])

    return {
      payments: paymentsRes.data ?? [],
      productSales: productSalesRes.data ?? []
    }
  })
}
