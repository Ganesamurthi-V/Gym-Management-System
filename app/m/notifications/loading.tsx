export default function Loading() {
  return (
    <div className="page-container py-6" aria-busy="true">
      <div className="mb-5 h-8 w-40 animate-pulse rounded-lg bg-slate-100" />
      <div className="space-y-3">
        {[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
      </div>
    </div>
  )
}
