export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-4xl mx-auto">
      <div className="w-32 h-7 bg-slate-100 skeleton rounded-lg" />
      <div className="w-56 h-10 bg-slate-100 skeleton rounded-xl" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 skeleton rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="w-32 h-4 bg-slate-100 skeleton rounded-md" />
                <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
              </div>
              <div className="w-16 h-5 bg-slate-100 skeleton rounded-md" />
            </div>
            <div className="flex gap-2">
              <div className="w-24 h-9 bg-slate-100 skeleton rounded-lg" />
              <div className="w-24 h-9 bg-slate-100 skeleton rounded-lg" />
              <div className="w-24 h-9 bg-slate-100 skeleton rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
