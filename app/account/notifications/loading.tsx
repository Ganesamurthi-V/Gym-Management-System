export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6" aria-busy="true">
      <span className="sr-only">Loading notifications…</span>

      {/* Header */}
      <div>
        <div className="w-28 h-4 bg-slate-100 skeleton rounded-md mb-2" />
        <div className="w-48 h-7 bg-slate-100 skeleton rounded-lg" />
      </div>

      {/* Tab strip */}
      <div className="flex gap-2">
        <div className="w-28 h-9 bg-slate-100 skeleton rounded-xl" />
        <div className="w-28 h-9 bg-slate-100 skeleton rounded-xl" />
      </div>

      {/* Message list */}
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-4">
            <div className="w-9 h-9 bg-slate-100 skeleton rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="w-40 h-4 bg-slate-100 skeleton rounded-md" />
              <div className="w-full h-3 bg-slate-100 skeleton rounded-md" />
              <div className="w-2/3 h-3 bg-slate-100 skeleton rounded-md" />
            </div>
            <div className="w-16 h-3 bg-slate-100 skeleton rounded-md flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
