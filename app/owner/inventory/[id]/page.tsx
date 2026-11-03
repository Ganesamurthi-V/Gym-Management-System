import { notFound } from 'next/navigation'
import InventoryDetailClient from '@/components/inventory/InventoryDetailClient'
import { getCachedInventoryItem, getCachedInventorySales, getCachedInventorySiblings } from '@/lib/api/inventory'

export default async function InventoryItemPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const { requireOwnerAccess } = await import('@/lib/owner/access')
  const { gym } = await requireOwnerAccess()

  // Fetch product first (needed for siblings query)
  const product = await getCachedInventoryItem(gym.id, id)
  if (!product) notFound()

  // Fetch sales and siblings in parallel
  const [sales, siblings] = await Promise.all([
    getCachedInventorySales(id).catch(() => []),
    getCachedInventorySiblings(gym.id, product.product_name),
  ])

  return (
    <InventoryDetailClient
      product={product}
      gymId={gym.id}
      sales={sales}
      siblings={siblings || []}
    />
  )
}
