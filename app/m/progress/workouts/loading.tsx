export default function WorkoutHistoryLoading() {
  return (
    <div className="page-container py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading workout history…</span>
      <div className="mb-4 h-6 w-28 animate-pulse rounded-full bg-surface-secondary" />
      <div className="mb-4 h-8 w-48 animate-pulse rounded-full bg-surface-secondary" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-surface-secondary" />
        ))}
      </div>
    </div>
  )
}
