export default function NewInventoryLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-200"></div>
        <div>
          <div className="h-7 w-48 bg-slate-200 rounded-lg mb-1.5"></div>
          <div className="h-4 w-64 bg-slate-100 rounded-lg"></div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Shared Product Details Skeleton */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-200"></div>
            <div className="h-4 w-32 bg-slate-200 rounded-lg"></div>
          </div>
          
          <div className="p-5 space-y-5">
            <div>
              <div className="h-3 w-24 bg-slate-200 rounded mb-2"></div>
              <div className="h-10 w-full bg-slate-100 rounded-xl"></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <div className="h-3 w-16 bg-slate-200 rounded mb-2"></div>
                <div className="h-10 w-full bg-slate-100 rounded-xl"></div>
              </div>
              <div>
                <div className="h-3 w-20 bg-slate-200 rounded mb-2"></div>
                <div className="h-10 w-full bg-slate-100 rounded-xl"></div>
              </div>
            </div>

            <div>
              <div className="h-3 w-32 bg-slate-200 rounded mb-2"></div>
              <div className="h-24 w-full bg-slate-100 rounded-xl"></div>
            </div>
          </div>
        </div>

        {/* Variants List Skeleton */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-6 w-24 bg-slate-200 rounded-lg"></div>
            <div className="h-8 w-28 bg-slate-200 rounded-lg"></div>
          </div>

          <div className="card overflow-hidden border-slate-100">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded bg-slate-200"></div>
                <div className="h-4 w-28 bg-slate-200 rounded"></div>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <div className="h-3 w-24 bg-slate-200 rounded mb-2"></div>
                  <div className="h-10 w-full bg-slate-100 rounded-xl"></div>
                </div>
                <div>
                  <div className="h-3 w-32 bg-slate-200 rounded mb-2"></div>
                  <div className="h-10 w-full bg-slate-100 rounded-xl"></div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {[...Array(3)].map((_, i) => (
                  <div key={i}>
                    <div className="h-3 w-20 bg-slate-200 rounded mb-2"></div>
                    <div className="h-10 w-full bg-slate-100 rounded-xl"></div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-slate-100">
                {[...Array(2)].map((_, i) => (
                  <div key={i}>
                    <div className="h-3 w-24 bg-slate-200 rounded mb-2"></div>
                    <div className="h-10 w-full bg-slate-100 rounded-xl"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions Skeleton */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <div className="h-10 w-24 bg-slate-200 rounded-xl"></div>
          <div className="h-10 w-48 bg-slate-200 rounded-xl"></div>
        </div>
      </div>
    </div>
  )
}
