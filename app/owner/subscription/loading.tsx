export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6" aria-busy="true">
      <span className="sr-only">Loading subscription…</span>

      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-14 h-14 bg-slate-100 skeleton rounded-2xl mx-auto" />
        <div className="w-56 h-7 bg-slate-100 skeleton rounded-lg mx-auto" />
        <div className="w-72 h-4 bg-slate-100 skeleton rounded-md mx-auto" />
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="w-24 h-4 bg-slate-100 skeleton rounded-md" />
            <div className="w-32 h-8 bg-slate-100 skeleton rounded-lg" />
            <div className="w-full h-3 bg-slate-100 skeleton rounded-md" />
            <div className="w-2/3 h-3 bg-slate-100 skeleton rounded-md" />
            <div className="w-full h-10 bg-slate-100 skeleton rounded-xl mt-2" />
          </div>
        ))}
      </div>

      {/* Payment details */}
      <div className="card p-5 space-y-3">
        <div className="w-40 h-4 bg-slate-100 skeleton rounded-md" />
        <div className="w-44 h-44 bg-slate-100 skeleton rounded-xl mx-auto" />
        <div className="w-52 h-4 bg-slate-100 skeleton rounded-md mx-auto" />
      </div>
    </div>
  )
}
