export default function InventoryItemLoading() {
  return (
    <div className="w-full h-[calc(100vh-6rem)] flex flex-col gap-4 pb-2 animate-pulse">
      {/* Header */}
      <div className="flex-none flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-200"></div>
          <div>
            <div className="h-7 w-48 bg-slate-200 rounded-lg mb-1.5"></div>
            <div className="h-4 w-32 bg-slate-100 rounded-lg"></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-20 bg-slate-200 rounded-xl"></div>
          <div className="h-9 w-28 bg-slate-200 rounded-xl"></div>
          <div className="w-9 h-9 bg-slate-200 rounded-xl"></div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Left Col */}
        <div className="md:col-span-1 flex flex-col gap-4 min-h-0">
          {/* Sales Summary Card */}
          <div className="card p-5 space-y-3 bg-slate-50/50">
            <div className="h-3 w-24 bg-slate-200 rounded"></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <div className="h-2 w-12 bg-slate-100 rounded mb-2"></div>
                <div className="h-6 w-20 bg-slate-200 rounded"></div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <div className="h-2 w-16 bg-slate-100 rounded mb-2"></div>
                <div className="h-6 w-12 bg-slate-200 rounded"></div>
              </div>
            </div>
          </div>

          {/* Variants Card */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 bg-slate-200 rounded"></div>
              <div className="h-6 w-24 bg-slate-100 rounded-lg"></div>
            </div>
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-3 rounded-xl border border-slate-100 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-4 w-24 bg-slate-200 rounded"></div>
                    <div className="h-4 w-12 bg-slate-100 rounded"></div>
                  </div>
                  <div className="h-3 w-20 bg-slate-100 rounded"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Details Card */}
          <div className="card p-5 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 mb-2"></div>
            
            <div>
              <div className="h-3 w-16 bg-slate-200 rounded mb-2"></div>
              <div className="h-4 w-24 bg-slate-100 rounded"></div>
            </div>
            <div>
              <div className="h-3 w-12 bg-slate-200 rounded mb-2"></div>
              <div className="h-4 w-32 bg-slate-100 rounded"></div>
            </div>
            
            <div className="pt-4 border-t border-slate-100">
              <div className="h-3 w-24 bg-slate-200 rounded mb-2"></div>
              <div className="h-6 w-20 bg-slate-200 rounded"></div>
            </div>
          </div>
        </div>

        {/* Right Col */}
        <div className="md:col-span-2 xl:col-span-3 flex flex-col min-h-0 h-full">
          <div className="card flex flex-col h-full overflow-hidden">
            <div className="flex-none px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-200"></div>
              <div className="space-y-2">
                <div className="h-4 w-28 bg-slate-200 rounded"></div>
                <div className="h-3 w-20 bg-slate-100 rounded"></div>
              </div>
            </div>

            <div className="flex-1">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-5 py-3"><div className="h-3 w-12 bg-slate-200 rounded"></div></th>
                    <th className="px-5 py-3"><div className="h-3 w-8 bg-slate-200 rounded ml-auto"></div></th>
                    <th className="px-5 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto"></div></th>
                    <th className="px-5 py-3"><div className="h-3 w-12 bg-slate-200 rounded ml-auto"></div></th>
                    <th className="px-5 py-3"><div className="h-3 w-10 bg-slate-200 rounded"></div></th>
                    <th className="px-5 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {[...Array(6)].map((_, i) => (
                    <tr key={i}>
                      <td className="px-5 py-4"><div className="h-4 w-32 bg-slate-100 rounded"></div></td>
                      <td className="px-5 py-4"><div className="h-4 w-6 bg-slate-200 rounded ml-auto"></div></td>
                      <td className="px-5 py-4"><div className="h-4 w-16 bg-slate-100 rounded ml-auto"></div></td>
                      <td className="px-5 py-4"><div className="h-4 w-16 bg-slate-200 rounded ml-auto"></div></td>
                      <td className="px-5 py-4"><div className="h-6 w-12 bg-slate-100 rounded-md"></div></td>
                      <td className="px-5 py-4"><div className="h-7 w-7 bg-slate-100 rounded-lg"></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
