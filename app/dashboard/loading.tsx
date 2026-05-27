export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto">
      {/* Page header skeleton */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-4 h-4 bg-slate-100 skeleton rounded-md" />
          <div className="w-24 h-4 bg-slate-100 skeleton rounded-md" />
        </div>
        <div className="w-36 h-7 bg-slate-100 skeleton rounded-lg" />
      </div>

      {/* Stats Grid — 2 cols mobile, 3 cols tablet, 6 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-3.5 md:p-4">
            <div className="w-8 h-8 bg-slate-100 skeleton rounded-xl mb-2" />
            <div className="w-12 h-6 bg-slate-100 skeleton rounded-md mb-1.5" />
            <div className="w-16 h-3.5 bg-slate-100 skeleton rounded-md" />
          </div>
        ))}
      </div>

      {/* Main Grid: Quick Actions + Expiring This Week */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Quick Actions Skeleton */}
        <div className="card p-4 md:p-5 space-y-3 bg-gradient-to-b from-white to-slate-50">
          <div className="w-28 h-4 bg-slate-100 skeleton rounded-md mb-4" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[52px] w-full bg-slate-100 skeleton rounded-xl" />
          ))}
        </div>

        {/* Expiring This Week Skeleton */}
        <div className="card md:col-span-2">
          <div className="flex items-center justify-between px-4 md:px-5 py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-slate-100 skeleton rounded-full" />
              <div className="w-36 h-5 bg-slate-100 skeleton rounded-md" />
            </div>
            <div className="w-12 h-4 bg-slate-100 skeleton rounded-md" />
          </div>

          <div className="divide-y divide-slate-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 md:px-5 py-3">
                <div className="w-8 h-8 bg-slate-100 skeleton rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="w-24 h-4 bg-slate-100 skeleton rounded-md" />
                  <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
                </div>
                <div className="w-16 h-3 bg-slate-100 skeleton rounded-md hidden sm:block" />
                <div className="w-16 h-8 bg-slate-100 skeleton rounded-lg flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
