export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6" aria-busy="true">
      <span className="sr-only">Loading account…</span>

      {/* Header */}
      <div>
        <div className="w-24 h-4 bg-slate-100 skeleton rounded-md mb-2" />
        <div className="w-40 h-7 bg-slate-100 skeleton rounded-lg" />
      </div>

      {/* Gym summary card */}
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-slate-100 skeleton rounded-2xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="w-44 h-5 bg-slate-100 skeleton rounded-md" />
            <div className="w-28 h-3.5 bg-slate-100 skeleton rounded-md" />
          </div>
        </div>
      </div>

      {/* Stat counts */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-4">
            <div className="w-10 h-6 bg-slate-100 skeleton rounded-md mb-1.5" />
            <div className="w-20 h-3.5 bg-slate-100 skeleton rounded-md" />
          </div>
        ))}
      </div>

      {/* Detail sections */}
      {[0, 1].map((s) => (
        <div key={s} className="card divide-y divide-slate-100 px-4">
          <div className="w-32 h-3.5 bg-slate-100 skeleton rounded-md my-3.5" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3.5">
              <div className="w-8 h-8 bg-slate-100 skeleton rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
                <div className="w-36 h-4 bg-slate-100 skeleton rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
