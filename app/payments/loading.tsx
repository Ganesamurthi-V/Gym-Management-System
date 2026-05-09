export default function PaymentsLoading() {
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-28" />
        <div className="skeleton h-9 w-20 rounded-lg" />
      </div>

      {/* Total collected card */}
      <div className="card p-5 bg-gradient-to-br from-brand-400/30 to-brand-500/30 space-y-3">
        <div className="skeleton h-3.5 w-28" />
        <div className="skeleton h-9 w-36" />
        <div className="flex gap-4">
          {[60, 48, 56, 80].map((w, i) => (
            <div key={i} className="skeleton h-3 rounded" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* Period + mode filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2">
          {[72, 64, 76, 88, 80].map((w, i) => (
            <div key={i} className="skeleton h-8 rounded-lg" style={{ width: w }} />
          ))}
        </div>
        <div className="flex gap-2">
          {[88, 64, 48, 56].map((w, i) => (
            <div key={i} className="skeleton h-8 rounded-lg" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* Search bars */}
      <div className="flex gap-2">
        <div className="skeleton h-10 flex-1 rounded-xl" />
        <div className="skeleton h-10 w-36 rounded-xl" />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="space-y-1.5 text-right">
              <div className="skeleton h-4 w-16" />
              <div className="skeleton h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-hidden">
        <div className="flex gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
          {[40, 160, 80, 160, 80, 80].map((w, i) => (
            <div key={i} className="skeleton h-3.5 rounded" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50">
            <div className="skeleton h-3.5 w-8" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-3.5 w-16" />
            <div className="skeleton h-3.5 w-36" />
            <div className="skeleton h-6 w-16 rounded-full" />
            <div className="skeleton h-4 w-16 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
