export default function AttendanceLoading() {
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="skeleton h-7 w-32" />
          <div className="skeleton h-3.5 w-44" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="card px-3 py-2 space-y-1.5 w-16">
              <div className="skeleton h-6 w-8 mx-auto" />
              <div className="skeleton h-2.5 w-10 mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="skeleton h-1.5 w-full rounded-full" />

      {/* Search */}
      <div className="skeleton h-10 w-full rounded-xl" />

      {/* Member grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="card p-3.5 flex items-center gap-3">
            <div className="skeleton w-6 h-6 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 rounded w-28" />
              <div className="skeleton h-3 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
