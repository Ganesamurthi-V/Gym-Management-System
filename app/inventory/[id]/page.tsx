import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Package, Tag, BadgeIndianRupee, Box } from 'lucide-react'
import InventoryUnitsManager from '@/components/inventory/InventoryUnitsManager'

export const revalidate = 0

export default async function InventoryItemPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get gym
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

  // Fetch units
  let units = []
  try {
    const { data: unitsData } = await supabase
      .from('inventory_units')
      .select('*')
      .eq('inventory_id', id)
      .order('created_at', { ascending: false })
    if (unitsData) units = unitsData
  } catch (e) {
    // Migration might not be run yet
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">{product.product_name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{product.variant_name} • {product.sku}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Col: Details */}
        <div className="md:col-span-1 space-y-6">
          <div className="card p-5 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-2">
              <Package className="w-6 h-6" />
            </div>
            
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Category</p>
              <p className="text-sm font-semibold text-slate-900 capitalize">{product.category || 'N/A'}</p>
            </div>
            
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Brand</p>
              <p className="text-sm font-semibold text-slate-900">{product.brand || 'N/A'}</p>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Selling Price</p>
              <p className="text-lg font-bold text-brand-600">₹{product.selling_price}</p>
            </div>
            
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cost Price</p>
              <p className="text-sm font-semibold text-slate-600">₹{product.cost_price}</p>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Stock count</p>
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-emerald-500" />
                <p className="text-lg font-bold text-slate-900">{product.initial_stock} units</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Serialized Tracking */}
        <div className="md:col-span-2">
          <InventoryUnitsManager productId={product.id} initialUnits={units} gymId={gym.id} />
        </div>
      </div>
    </div>
  )
}
