import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import InventoryDetailClient from '@/components/inventory/InventoryDetailClient'
import { getCachedInventoryItem, getCachedInventorySales, getCachedInventorySiblings } from '@/lib/api/inventory'

export default async function InventoryItemPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const { getAuthUser, getGym } = await import('@/lib/dal')
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  // Fetch product
  const product = await getCachedInventoryItem(gym.id, id)

  if (!product) {
    notFound()
  }

  // Fetch sales for this product
  let sales: any[] = []
  try {
    sales = await getCachedInventorySales(id)
  } catch (e) {
    // Migration might not be run yet
  }

  // Fetch siblings (variants of this product)
  const siblings = await getCachedInventorySiblings(gym.id, product.product_name)

  return (
    <InventoryDetailClient
      product={product}
      gymId={gym.id}
      sales={sales}
      siblings={siblings || []}
    />
  )
}
