import { getAuthUser, getGym } from '@/lib/dal'
import Link from 'next/link'
import { Plus, Package } from 'lucide-react'
import InventoryFilters from '@/components/inventory/InventoryFilters'
import { getCachedInventory } from '@/lib/api/inventory'

export default async function InventoryPage(props: { searchParams?: Promise<{ query?: string, category?: string }> }) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const category = searchParams?.category || '';

  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  let items: any[] = []
  try {
    const allItems = await getCachedInventory(gym.id)

    // Apply filters in memory (fast — items are already cached and limited to 500)
    items = allItems.filter(item => {
      if (query) {
        const lowerQuery = query.toLowerCase()
        if (!item.product_name?.toLowerCase().includes(lowerQuery) &&
            !item.sku?.toLowerCase().includes(lowerQuery)) return false
      }
      if (category && item.category !== category) return false
      return true
    })
  } catch (e) {
    console.error("Inventory fetch error - did you run the DB migration?", e)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 xs:space-y-6">
      <div className="flex flex-col xs:flex-row xs:items-start sm:items-center justify-between gap-3 xs:gap-4">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your products, stock, and pricing</p>
        </div>
        {items.length > 0 && (
          <Link
            href="/owner/inventory/new"
            className="btn-primary inline-flex items-center gap-2 shadow-md shadow-brand-500/20 self-start xs:self-auto"
          >
            <Plus className="w-4 h-4" />
            Add New Product
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center justify-center min-h-[400px] text-center p-8 border border-dashed border-slate-200 bg-slate-50/50 shadow-none">
          <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-brand-50/50">
            <Package className="w-10 h-10 text-brand-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Your inventory is empty</h2>
          <p className="text-slate-500 max-w-sm mb-8 text-sm leading-relaxed">
            Start tracking your gym's products, supplements, and merchandise by adding your first item.
          </p>
          <Link href="/owner/inventory/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add First Product
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <InventoryFilters />
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[480px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-4 xl:px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Product</th>
                  <th className="px-4 xl:px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">SKU</th>
                  <th className="px-4 xl:px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Category</th>
                  <th className="px-4 xl:px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Price</th>
                  <th className="px-4 xl:px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors cursor-pointer group">
                    <td className="px-4 xl:px-5 py-3.5 xs:py-4">
                      <div className="flex items-center gap-2 xs:gap-3">
                        <div className="w-9 h-9 xs:w-10 xs:h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-white group-hover:shadow-sm transition-all border border-slate-100">
                          <Package className="w-4 h-4 xs:w-5 xs:h-5 text-slate-400 group-hover:text-brand-500 transition-colors" />
                        </div>
                        <div className="min-w-0">
                          <Link href={`/owner/inventory/${item.id}`} className="font-bold text-slate-900 hover:text-brand-600 transition-colors block truncate max-w-[140px] xs:max-w-[180px] sm:max-w-none">
                            {item.product_name}
                          </Link>
                          <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.variant_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 xl:px-5 py-3.5 xs:py-4 text-sm text-slate-500 font-mono font-medium hidden lg:table-cell">{item.sku || '—'}</td>
                    <td className="px-4 xl:px-5 py-3.5 xs:py-4 text-sm text-slate-600 capitalize font-medium hidden md:table-cell">{item.category || '—'}</td>
                    <td className="px-4 xl:px-5 py-3.5 xs:py-4 text-sm font-bold text-slate-900 text-right">₹{item.selling_price}</td>
                    <td className="px-4 xl:px-5 py-3.5 xs:py-4 text-right">
                      <span className={`inline-flex items-center px-2 xs:px-2.5 py-1 rounded-full text-[10px] xs:text-[11px] uppercase tracking-wide font-bold ${
                        item.initial_stock === 0
                          ? 'bg-red-50 text-red-600 border border-red-100'
                          : item.initial_stock <= (item.low_stock_threshold || 5)
                          ? 'bg-amber-50 text-amber-600 border border-amber-100'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      }`}>
                        {item.initial_stock === 0 ? 'Out' : `${item.initial_stock}`}
                        <span className="hidden xs:inline">{item.initial_stock === 0 ? ' of Stock' : ' in stock'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
