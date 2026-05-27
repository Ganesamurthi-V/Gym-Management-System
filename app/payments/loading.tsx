export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-7xl mx-auto">
      {/* Page Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="w-28 h-7 bg-slate-100 skeleton rounded-lg" />
        <div className="w-20 h-9 bg-slate-100 skeleton rounded-lg" />
      </div>

      {/* Collection Banner skeleton */}
      <div className="card p-5 h-[132px] bg-slate-100 skeleton rounded-xl w-full" />

      {/* Pending Dues banner skeleton */}
      <div className="card p-4 h-[54px] bg-slate-100 skeleton rounded-xl w-full" />

      {/* Period & Mode Filters skeleton */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[60, 60, 65, 80, 75].map((w, i) => (
            <div key={i} className="h-8 bg-slate-100 skeleton rounded-lg flex-shrink-0" style={{ width: `${w}px` }} />
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[90, 60, 50, 50].map((w, i) => (
            <div key={i} className="h-8 bg-slate-100 skeleton rounded-lg flex-shrink-0" style={{ width: `${w}px` }} />
          ))}
        </div>
      </div>

      {/* Search fields skeleton */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="h-10 bg-slate-100 skeleton rounded-xl flex-1" />
        <div className="h-10 bg-slate-100 skeleton rounded-xl sm:w-40" />
      </div>

      {/* Transactions List/Table Card skeleton */}
      <div className="card overflow-hidden">
        {/* Mobile View */}
        <div className="md:hidden divide-y divide-slate-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 skeleton rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="w-24 h-4 bg-slate-100 skeleton rounded-md" />
                <div className="w-36 h-3 bg-slate-100 skeleton rounded-md" />
              </div>
              <div className="text-right space-y-1.5 flex-shrink-0">
                <div className="w-16 h-4 bg-slate-100 skeleton rounded-md ml-auto" />
                <div className="w-12 h-3.5 bg-slate-100 skeleton rounded-full ml-auto" />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['#', 'Member', 'Plan', 'Period', 'Mode', 'Amount'].map((h, i) => (
                  <th key={i} className={h === 'Amount' ? 'text-right px-5 py-3 text-xs font-bold text-slate-300 uppercase tracking-wide' : 'text-left px-5 py-3 text-xs font-bold text-slate-300 uppercase tracking-wide'}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...Array(6)].map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-3.5">
                    <div className="w-12 h-3.5 bg-slate-100 skeleton rounded-md" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="space-y-1.5">
                      <div className="w-32 h-4 bg-slate-100 skeleton rounded-md" />
                      <div className="w-24 h-3 bg-slate-100 skeleton rounded-md" />
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-16 h-4 bg-slate-100 skeleton rounded-md" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-32 h-3.5 bg-slate-100 skeleton rounded-md" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-16 h-5.5 bg-slate-100 skeleton rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-20 h-4 bg-slate-100 skeleton rounded-md ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
