export default function WorkoutHistoryLoading() {
  return (
    <div className="page-container py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading workout history…</span>
      <div className="mb-4 h-6 w-28 animate-pulse rounded bg-slate-100" />
      <div className="mb-4 h-7 w-48 animate-pulse rounded bg-slate-200" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
