import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import InventoryDetailClient from '@/components/inventory/InventoryDetailClient'

export const revalidate = 0

export default async function InventoryItemPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  // Fetch product
  const { data: product, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .single()

  if (error || !product) {
    notFound()
  }

  // Fetch sales for this product
  let sales: any[] = []
  try {
    const { data: salesData } = await supabase
      .from('inventory_sales')
      .select('*')
      .eq('inventory_id', id)
      .order('sold_at', { ascending: false })
    if (salesData) sales = salesData
  } catch (e) {
    // Migration might not be run yet
  }

  // Fetch siblings (variants of this product)
  const { data: siblings } = await supabase
    .from('inventory')
    .select('*')
    .eq('gym_id', gym.id)
    .eq('product_name', product.product_name)
    .order('created_at', { ascending: true })

  return (
    <InventoryDetailClient
      product={product}
      gymId={gym.id}
      sales={sales}
      siblings={siblings || []}
    />
  )
}
