import { Plus, Package } from 'lucide-react'

export default function InventoryLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="h-8 w-64 bg-slate-200 rounded-lg mb-2"></div>
          <div className="h-4 w-48 bg-slate-100 rounded-lg"></div>
        </div>
        <div className="h-10 w-40 bg-slate-200 rounded-xl"></div>
      </div>

      <div className="card overflow-hidden">
        {/* Filters Skeleton */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
          <div className="h-10 flex-1 max-w-sm bg-slate-200 rounded-xl"></div>
          <div className="h-10 w-32 bg-slate-200 rounded-xl"></div>
        </div>
        
        {/* Table Skeleton */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="px-5 py-3.5"><div className="h-3 w-16 bg-slate-200 rounded"></div></th>
                <th className="px-5 py-3.5"><div className="h-3 w-12 bg-slate-200 rounded"></div></th>
                <th className="px-5 py-3.5"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                <th className="px-5 py-3.5"><div className="h-3 w-12 bg-slate-200 rounded ml-auto"></div></th>
                <th className="px-5 py-3.5"><div className="h-3 w-16 bg-slate-200 rounded ml-auto"></div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex-shrink-0"></div>
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-slate-200 rounded"></div>
                        <div className="h-3 w-20 bg-slate-100 rounded"></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4"><div className="h-4 w-24 bg-slate-100 rounded"></div></td>
                  <td className="px-5 py-4"><div className="h-4 w-20 bg-slate-100 rounded"></div></td>
                  <td className="px-5 py-4"><div className="h-5 w-16 bg-slate-200 rounded ml-auto"></div></td>
                  <td className="px-5 py-4"><div className="h-6 w-24 bg-slate-100 rounded-full ml-auto"></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
