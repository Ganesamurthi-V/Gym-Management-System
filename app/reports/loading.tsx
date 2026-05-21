export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto">
      {/* Page header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="w-24 h-7 bg-slate-100 skeleton rounded-lg" />
        <div className="w-24 h-9 bg-slate-100 skeleton rounded-lg" />
      </div>

      {/* Tab select buttons skeleton */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[90, 90, 90].map((w, i) => (
          <div key={i} className="h-9 bg-slate-100 skeleton rounded-lg flex-shrink-0" style={{ width: `${w}px` }} />
        ))}
      </div>

      {/* Date range filter skeleton */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="h-9 w-40 bg-slate-100 skeleton rounded-lg" />
      </div>

      {/* Overview Tab Content Skeleton */}
      <div className="space-y-6">
        {/* KPI Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 h-28 flex flex-col justify-between">
              <div className="w-10 h-10 bg-slate-100 skeleton rounded-xl" />
              <div className="space-y-1.5 mt-2">
                <div className="w-16 h-5 bg-slate-100 skeleton rounded-md" />
                <div className="w-24 h-3 bg-slate-100 skeleton rounded-md" />
              </div>
            </div>
          ))}
        </div>

        {/* Charts & Graphs Skeleton Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card p-5 h-72 flex flex-col justify-between">
              <div className="h-10 bg-slate-100 skeleton rounded-t-xl w-full" />
              <div className="h-44 bg-slate-100 skeleton rounded-md w-full my-4" />
              <div className="h-4 bg-slate-100 skeleton rounded-md w-1/3" />
            </div>
          ))}
        </div>

        {/* Insight Box Skeleton */}
        <div className="card p-5 h-36 bg-slate-50 skeleton rounded-xl w-full" />
      </div>
    </div>
  )
}
