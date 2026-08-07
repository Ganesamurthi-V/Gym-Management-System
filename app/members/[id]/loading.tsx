export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto space-y-4 md:space-y-6" aria-busy="true">
      <span className="sr-only">Loading member…</span>

      {/* Back link + header */}
      <div className="w-28 h-4 bg-slate-100 skeleton rounded-md" />

      {/* Member identity card */}
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-slate-100 skeleton rounded-2xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="w-44 h-6 bg-slate-100 skeleton rounded-md" />
            <div className="w-24 h-3.5 bg-slate-100 skeleton rounded-md" />
            <div className="w-32 h-3.5 bg-slate-100 skeleton rounded-md" />
          </div>
          <div className="w-24 h-9 bg-slate-100 skeleton rounded-xl hidden sm:block" />
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="w-8 h-8 bg-slate-100 skeleton rounded-xl mb-2" />
            <div className="w-12 h-6 bg-slate-100 skeleton rounded-md mb-1.5" />
            <div className="w-16 h-3.5 bg-slate-100 skeleton rounded-md" />
          </div>
        ))}
      </div>

      {/* Two-column detail + history */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {[0, 1].map((s) => (
          <div key={s} className="card divide-y divide-slate-100 px-4">
            <div className="w-32 h-3.5 bg-slate-100 skeleton rounded-md my-3.5" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-3.5">
                <div className="w-24 h-4 bg-slate-100 skeleton rounded-md" />
                <div className="w-16 h-4 bg-slate-100 skeleton rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
