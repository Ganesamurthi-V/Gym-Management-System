export default function ProgramsLoading() {
  return (
    <div className="w-full max-w-7xl mx-auto pb-8 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="h-8 w-56 bg-slate-200 rounded-lg mb-2" />
          <div className="h-4 w-64 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-10 w-40 bg-slate-200 rounded-xl" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="h-11 flex-1 bg-slate-200 rounded-xl" />
        <div className="h-11 w-56 bg-slate-100 rounded-xl" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex gap-2 mb-4">
              <div className="h-5 w-20 bg-slate-100 rounded-md" />
              <div className="h-5 w-24 bg-slate-100 rounded-md" />
            </div>
            <div className="h-5 w-3/4 bg-slate-200 rounded mb-2" />
            <div className="h-4 w-full bg-slate-100 rounded mb-1.5" />
            <div className="h-4 w-2/3 bg-slate-100 rounded mb-6" />
            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100">
              {[...Array(3)].map((__, j) => (
                <div key={j}>
                  <div className="h-3 w-14 bg-slate-100 rounded mb-2" />
                  <div className="h-4 w-8 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
