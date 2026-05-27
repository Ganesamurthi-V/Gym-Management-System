export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-7xl mx-auto">
      {/* Page header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="w-36 h-7 bg-slate-100 skeleton rounded-lg" />
          <div className="w-44 h-4 bg-slate-100 skeleton rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card px-3 py-2 text-center w-14 h-[52px] skeleton" />
          ))}
        </div>
      </div>

      {/* Progress bar skeleton */}
      <div className="h-1.5 bg-slate-100 skeleton rounded-full" />

      {/* Search skeleton */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="h-10 bg-slate-100 skeleton rounded-xl flex-1" />
        <div className="h-10 bg-slate-100 skeleton rounded-xl sm:w-40" />
      </div>

      {/* Members grid — 1 col mobile, 2 col tablet, 3 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="card p-3.5 flex items-center gap-3">
            <div className="w-6 h-6 bg-slate-100 skeleton rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="w-24 h-4 bg-slate-100 skeleton rounded-md" />
                <div className="w-8 h-3 bg-slate-100 skeleton rounded-md flex-shrink-0" />
              </div>
              <div className="w-16 h-3 bg-slate-100 skeleton rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
