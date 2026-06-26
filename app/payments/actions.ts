'use server'

import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'

export async function getAllTimePayments(gymId: string) {
  const cacheKey = `gym:${gymId}:payments_page:allTime`
  
  return cacheWrapper(cacheKey, 300, async () => {
    const supabase = await createClient()
    
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
