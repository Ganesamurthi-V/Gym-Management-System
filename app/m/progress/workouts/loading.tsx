export default function WorkoutHistoryLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading workout history…</span>
      <div className="flex h-14 items-center gap-3 px-4 xs:px-5 sm:px-6">
        <div className="h-10 w-10 animate-pulse rounded-full bg-surface-secondary" />
        <div className="h-5 w-40 animate-pulse rounded-full bg-surface-secondary" />
      </div>
      <div className="page-container pb-6 pt-2">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    </div>
  )
}
