export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="w-28 h-7 bg-slate-100 skeleton rounded-lg" />
          <div className="w-64 max-w-full h-4 bg-slate-100 skeleton rounded-md" />
        </div>
        <div className="w-20 h-10 bg-slate-100 skeleton rounded-xl" />
      </div>

      {/* The five questions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 md:gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card rounded-2xl p-3.5 md:p-4 flex lg:flex-col items-center lg:items-start gap-3">
            <div className="w-10 h-10 bg-slate-100 skeleton rounded-xl flex-shrink-0" />
            <div className="space-y-2 flex-1 w-full">
              <div className="w-3/4 h-3 bg-slate-100 skeleton rounded-md" />
              <div className="w-1/2 h-4 bg-slate-100 skeleton rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* The selected answer */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card rounded-2xl p-4 space-y-2">
            <div className="w-20 h-3 bg-slate-100 skeleton rounded-md" />
            <div className="w-16 h-7 bg-slate-100 skeleton rounded-md" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="card rounded-2xl p-4 md:p-6 h-72 lg:col-span-2">
          <div className="w-48 h-5 bg-slate-100 skeleton rounded-md" />
          <div className="h-52 bg-slate-100 skeleton rounded-xl w-full mt-4" />
        </div>
        <div className="card rounded-2xl p-4 md:p-6 h-72 space-y-4">
          <div className="w-24 h-5 bg-slate-100 skeleton rounded-md" />
          {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-slate-100 skeleton rounded-md w-full" />)}
        </div>
      </div>
    </div>
  )
}
