export default function MembersLoading() {
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-28" />
        <div className="flex gap-2">
          <div className="skeleton h-9 w-20 rounded-lg" />
          <div className="skeleton h-9 w-28 rounded-lg" />
          <div className="skeleton h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Search bars */}
      <div className="flex gap-2">
        <div className="skeleton h-10 flex-1 rounded-xl" />
        <div className="skeleton h-10 w-36 rounded-xl" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[80, 64, 80, 72].map((w, i) => (
          <div key={i} className="skeleton h-8 rounded-lg" style={{ width: w }} />
        ))}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card p-3.5 flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-3 w-32" />
            </div>
            <div className="skeleton h-6 w-14 rounded-full" />
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-hidden">
        <div className="flex gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
          {[40, 160, 120, 80, 120, 80].map((w, i) => (
            <div key={i} className="skeleton h-3.5 rounded" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50">
            <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-3.5 w-24" />
            <div className="skeleton h-3.5 w-20" />
            <div className="skeleton h-6 w-16 rounded-full" />
            <div className="skeleton h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
