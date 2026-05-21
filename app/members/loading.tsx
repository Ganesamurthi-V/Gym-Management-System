export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-7xl mx-auto">
      {/* Page header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="w-28 h-7 bg-slate-100 skeleton rounded-lg" />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-32 h-9 bg-slate-100 skeleton rounded-lg" />
          <div className="w-20 h-9 bg-slate-100 skeleton rounded-lg hidden sm:block" />
          <div className="w-32 h-9 bg-slate-100 skeleton rounded-lg hidden sm:block" />
          <div className="w-28 h-9 bg-slate-100 skeleton rounded-lg" />
        </div>
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-100 skeleton rounded-xl flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
              <div className="w-8 h-5 bg-slate-100 skeleton rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* Search inputs skeleton */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="h-10 bg-slate-100 skeleton rounded-xl flex-1" />
        <div className="h-10 bg-slate-100 skeleton rounded-xl sm:w-40" />
      </div>

      {/* Filter tabs skeleton */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[100, 80, 90, 85].map((w, i) => (
          <div key={i} className="h-8 bg-slate-100 skeleton rounded-lg flex-shrink-0" style={{ width: `${w}px` }} />
        ))}
      </div>

      {/* Members List/Table Card Skeleton */}
      <div className="card overflow-hidden">
        {/* Mobile View Skeleton (visible on mobile, hidden on desktop) */}
        <div className="md:hidden divide-y divide-slate-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 skeleton rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-3 bg-slate-100 skeleton rounded-md" />
                  <div className="w-28 h-4 bg-slate-100 skeleton rounded-md" />
                  <div className="w-14 h-4 bg-slate-100 skeleton rounded-full ml-auto" />
                </div>
                <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
                <div className="w-36 h-3 bg-slate-100 skeleton rounded-md" />
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-8 h-8 bg-slate-100 skeleton rounded-lg" />
                <div className="w-8 h-8 bg-slate-100 skeleton rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View Skeleton (hidden on mobile, visible on desktop) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['#', 'Member', 'Phone', 'Plan', 'Expires', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3 text-xs font-bold text-slate-300 uppercase tracking-wide">
                    {h || <div className="w-4" />}
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
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 skeleton rounded-lg flex-shrink-0" />
                      <div className="w-32 h-4 bg-slate-100 skeleton rounded-md" />
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-24 h-4 bg-slate-100 skeleton rounded-md" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-16 h-4 bg-slate-100 skeleton rounded-md" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-36 h-4 bg-slate-100 skeleton rounded-md" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-16 h-5.5 bg-slate-100 skeleton rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-16 h-7.5 bg-slate-100 skeleton rounded-lg" />
                      <div className="w-8 h-7.5 bg-slate-100 skeleton rounded-lg" />
                    </div>
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
