// Fallback while AppShell's AccessGate waits for the gym row. Same blocks and classes as
// app/owner/dashboard/DashboardSkeleton.tsx so the hand-off to a page's own loading.tsx does not jump.
export default function GenericPageSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto" aria-busy="true">
      <div>
        <div className="w-24 h-4 bg-slate-100 skeleton rounded-md mb-2" />
        <div className="w-36 h-7 bg-slate-100 skeleton rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-3.5 md:p-4">
            <div className="w-8 h-8 bg-slate-100 skeleton rounded-xl mb-2" />
            <div className="w-12 h-6 bg-slate-100 skeleton rounded-md mb-1.5" />
            <div className="w-16 h-3.5 bg-slate-100 skeleton rounded-md" />
          </div>
        ))}
      </div>
      <div className="card p-4 md:p-5 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[52px] w-full bg-slate-100 skeleton rounded-xl" />
        ))}
      </div>
    </div>
  )
}
