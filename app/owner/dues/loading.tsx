export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-4xl mx-auto">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="w-28 h-7 bg-slate-100 skeleton rounded-lg" />
        <div className="card px-4 py-2.5 flex items-center gap-2 w-36 h-[50px] skeleton" />
      </div>

      {/* Due Members List Card Skeleton */}
      <div className="card overflow-hidden">
        <div className="divide-y divide-slate-50">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 skeleton rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-4 bg-slate-100 skeleton rounded-md" />
                    <div className="w-8 h-3.5 bg-slate-100 skeleton rounded-md" />
                  </div>
                  <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
                </div>
                <div className="text-right space-y-1 flex-shrink-0">
                  <div className="w-16 h-4.5 bg-slate-100 skeleton rounded-md ml-auto" />
                  <div className="w-12 h-3 bg-slate-100 skeleton rounded-md ml-auto" />
                </div>
                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                  <div className="w-8 h-8 bg-slate-100 skeleton rounded-lg" />
                  <div className="w-8 h-8 bg-slate-100 skeleton rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
