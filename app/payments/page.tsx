import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { PaymentsClient } from './PaymentsClient'
import { subMonths, format } from 'date-fns'
import { startPageTimer, timed } from '@/lib/perf'

/**
 * REMOVED: the 300s Upstash `payments_page:12mo` cache.
 *
 * The cached payload was ~31KB and this project's Upstash instance takes
 * ~1850ms (median) to GET that over its REST API, versus ~396ms to run the four
 * queries below concurrently against Postgres. The cache was adding roughly
 * 1.4s per page load. See the note on MAX_CACHEABLE_BYTES in lib/cache.ts.
 */
export default async function PaymentsPage() {
  const done = startPageTimer('payments')
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  const data = await (async () => {
    const supabase = await createClient()

    const twelveMonthsAgo = format(subMonths(new Date(), 12), 'yyyy-MM-dd')

    const [paymentsRes, productSalesRes, pendingMembersRes, duePaymentsRes] = await timed('payments (4 parallel)', () => Promise.all([
      supabase
        .from('memberships')
        .select('id, member_id, plan, start_date, end_date, amount, admission_fee, due_amount, payment_mode, created_at, member:members(id, name, phone, member_number)')
        .eq('gym_id', gym.id)
        .gte('created_at', twelveMonthsAgo)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('inventory_sales')
        .select('id, product_name, variant_name, quantity, unit_price, total_price, payment_mode, sold_at')
        .eq('gym_id', gym.id)
        .gte('sold_at', twelveMonthsAgo)
        .order('sold_at', { ascending: false })
        .limit(500),
      supabase
        .from('members')
        .select('id, name, phone, member_number, pending_amount')
        .eq('gym_id', gym.id)
        .gt('pending_amount', 0)
        .order('pending_amount', { ascending: false })
        .limit(200),
      supabase
        .from('due_payments')
        .select('id, member_id, amount, payment_mode, created_at, member:members(id, name, phone, member_number)')
        .eq('gym_id', gym.id)
        .gte('created_at', twelveMonthsAgo)
        .order('created_at', { ascending: false })
        .limit(500),
    ]))

    return {
      payments: paymentsRes.data ?? [],
      productSales: productSalesRes.data ?? [],
      pendingMembers: pendingMembersRes.data ?? [],
      duePayments: duePaymentsRes.data ?? [],
    }
  })()

  done()

  return (
    <PaymentsClient
      payments={data.payments as any}
      productSales={data.productSales}
      duePayments={data.duePayments as any}
      pendingMembers={data.pendingMembers}
      gymId={gym.id}
      gymName={gym.name}
    />
  )
}
