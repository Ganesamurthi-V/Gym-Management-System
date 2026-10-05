export default function Loading() {
  return (
    <div className="space-y-6 md:space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-2">
          <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
          <div className="w-56 h-7 bg-slate-100 skeleton rounded-lg" />
          <div className="w-72 max-w-full h-4 bg-slate-100 skeleton rounded-md" />
        </div>
        <div className="w-36 h-10 bg-slate-100 skeleton rounded-xl" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {[92, 88, 104, 100, 96].map((w, i) => (
          <div key={i} className="h-10 bg-slate-100 skeleton rounded-xl flex-shrink-0" style={{ width: `${w}px` }} />
        ))}
      </div>

      {/* Today's priorities */}
      <div className="space-y-4">
        <div className="w-44 h-6 bg-slate-100 skeleton rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 md:p-6 h-44 flex flex-col justify-between rounded-2xl">
              <div className="flex justify-between">
                <div className="w-10 h-10 bg-slate-100 skeleton rounded-xl" />
                <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
              </div>
              <div className="space-y-2">
                <div className="w-3/4 h-4 bg-slate-100 skeleton rounded-md" />
                <div className="w-full h-3 bg-slate-100 skeleton rounded-md" />
              </div>
              <div className="w-28 h-8 bg-slate-100 skeleton rounded-xl self-end" />
            </div>
          ))}
        </div>
      </div>

      {/* Health · recoverable revenue · members at risk */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-5 md:p-6 h-80 flex flex-col justify-between rounded-2xl">
            <div className="w-40 h-5 bg-slate-100 skeleton rounded-md" />
            <div className="h-40 bg-slate-100 skeleton rounded-xl w-full" />
            <div className="w-2/3 h-4 bg-slate-100 skeleton rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
