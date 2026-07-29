/**
 * Route-level skeleton. Also reused as the Suspense fallback in page.tsx so the
 * loading shape stays identical in both paths.
 */
export default function MemberAppSkeleton() {
  return (
    <div className="max-w-8xl mx-auto space-y-5 sm:space-y-6 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-7 w-44 bg-slate-200 rounded-lg mb-2" />
        <div className="h-4 w-72 bg-slate-100 rounded-lg" />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-surface-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-slate-100" />
              <div className="h-3 w-16 bg-slate-100 rounded" />
            </div>
            <div className="h-6 w-12 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="border-b border-surface-border flex gap-3 pb-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 w-20 bg-slate-100 rounded" />
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-surface-border p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="h-5 w-52 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-64 bg-slate-100 rounded" />
          </div>
          <div className="h-9 w-56 bg-slate-100 rounded-xl" />
        </div>

        <div className="flex gap-2 mb-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-5 w-20 bg-slate-100 rounded-full" />
          ))}
        </div>

        <div className="space-y-3">
          <div className="h-3 w-full bg-slate-100 rounded" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-1">
              <div className="w-4 h-4 bg-slate-100 rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 bg-slate-200 rounded" />
                <div className="h-3 w-28 bg-slate-100 rounded" />
              </div>
              <div className="h-5 w-20 bg-slate-100 rounded-full" />
              <div className="h-5 w-20 bg-slate-100 rounded-full" />
              <div className="h-4 w-24 bg-slate-100 rounded hidden md:block" />
              <div className="h-8 w-8 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
