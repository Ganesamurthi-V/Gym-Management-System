export default function BodyProgressLoading() {
  return (
    <div className="page-container py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading body progress…</span>
      <div className="mb-4 h-6 w-28 animate-pulse rounded bg-slate-100" />
      <div className="mb-4 h-7 w-44 animate-pulse rounded bg-slate-200" />
      <div className="mb-4 h-48 animate-pulse rounded-2xl bg-slate-100" />
      <div className="mb-4 h-44 animate-pulse rounded-2xl bg-slate-100" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
