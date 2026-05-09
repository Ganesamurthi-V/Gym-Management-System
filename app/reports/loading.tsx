export default function ReportsLoading() {
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-24" />
        <div className="skeleton h-9 w-28 rounded-lg" />
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="skeleton h-3.5 w-20" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Revenue chart card */}
      <div className="card p-5 space-y-4">
        <div className="skeleton h-4 w-36" />
        <div className="flex items-end gap-3 h-32">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className="skeleton w-full rounded-t-sm" style={{ height: `${40 + Math.random() * 60}px` }} />
              <div className="skeleton h-3 w-10" />
            </div>
          ))}
        </div>
      </div>

      {/* Two column cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="skeleton h-4 w-32" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between">
                <div className="skeleton h-3.5 w-24" />
                <div className="skeleton h-3.5 w-12" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
