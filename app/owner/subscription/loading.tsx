export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6" aria-busy="true">
      <span className="sr-only">Loading subscription…</span>

      {/* Top row */}
      <div className="flex items-center justify-between">
        <div className="w-36 h-4 bg-slate-100 skeleton rounded-md" />
        <div className="w-28 h-4 bg-slate-100 skeleton rounded-md" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Checkout card: stepper + plan rows */}
        <div className="lg:col-span-3 card p-5 space-y-4">
          <div className="w-44 h-6 bg-slate-100 skeleton rounded-md" />
          {[0, 1].map((i) => (
            <div key={i} className="w-full h-16 bg-slate-100 skeleton rounded-xl" />
          ))}
        </div>

        {/* Order summary */}
        <div className="lg:col-span-2 card p-5 space-y-3">
          <div className="w-32 h-4 bg-slate-100 skeleton rounded-md" />
          <div className="w-full h-4 bg-slate-100 skeleton rounded-md" />
          <div className="w-full h-8 bg-slate-100 skeleton rounded-lg" />
          <div className="w-full h-12 bg-slate-100 skeleton rounded-xl" />
        </div>
      </div>
    </div>
  )
}
