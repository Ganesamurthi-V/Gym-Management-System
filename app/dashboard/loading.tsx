export default function DashboardLoading() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-3.5 w-20" />
          <div className="skeleton h-7 w-32" />
        </div>
        <div className="skeleton h-9 w-20 rounded-lg" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-3.5 md:p-4 space-y-2">
            <div className="skeleton h-8 w-8 rounded-xl" />
            <div className="skeleton h-7 w-10" />
            <div className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Quick actions */}
        <div className="card p-4 md:p-5 space-y-3">
          <div className="skeleton h-3.5 w-28" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton h-12 w-full rounded-xl" />
          ))}
        </div>

        {/* Expiring list */}
        <div className="card md:col-span-2">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-7 w-28 rounded-lg" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50">
              <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-20" />
              </div>
              <div className="skeleton h-3.5 w-16 hidden sm:block" />
              <div className="skeleton h-7 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
