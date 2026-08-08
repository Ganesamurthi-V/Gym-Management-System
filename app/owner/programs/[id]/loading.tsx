export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6" aria-busy="true">
      <span className="sr-only">Loading program…</span>

      <div className="w-32 h-4 bg-slate-100 skeleton rounded-md" />

      {/* Program header */}
      <div className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="w-56 h-6 bg-slate-100 skeleton rounded-md" />
          <div className="w-20 h-6 bg-slate-100 skeleton rounded-full flex-shrink-0" />
        </div>
        <div className="w-full h-3 bg-slate-100 skeleton rounded-md" />
        <div className="w-3/4 h-3 bg-slate-100 skeleton rounded-md" />
        <div className="flex gap-4 pt-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-20 h-3.5 bg-slate-100 skeleton rounded-md" />
          ))}
        </div>
      </div>

      {/* Weekly schedule */}
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4 space-y-2.5">
            <div className="w-28 h-4 bg-slate-100 skeleton rounded-md" />
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center justify-between">
                <div className="w-36 h-3.5 bg-slate-100 skeleton rounded-md" />
                <div className="w-16 h-3.5 bg-slate-100 skeleton rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
