export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="w-32 h-7 bg-slate-100 skeleton rounded-lg" />
        <div className="w-28 h-11 bg-slate-100 skeleton rounded-xl" />
      </div>
      <div className="card overflow-hidden divide-y divide-slate-50">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <div className="w-40 h-4 bg-slate-100 skeleton rounded-md" />
              <div className="w-24 h-3 bg-slate-100 skeleton rounded-md" />
            </div>
            <div className="w-11 h-11 bg-slate-100 skeleton rounded-lg" />
            <div className="w-11 h-11 bg-slate-100 skeleton rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
