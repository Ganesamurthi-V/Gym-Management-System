export default function BodyProgressLoading() {
  return (
    <div className="page-container py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading body progress…</span>
      <div className="mb-4 h-6 w-28 animate-pulse rounded-full bg-surface-secondary" />
      <div className="mb-4 h-8 w-44 animate-pulse rounded-full bg-surface-secondary" />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="h-24 animate-pulse rounded-3xl bg-surface-secondary" />
        <div className="h-24 animate-pulse rounded-3xl bg-surface-secondary" />
      </div>
      <div className="mb-4 h-48 animate-pulse rounded-3xl bg-surface-secondary" />
      <div className="mb-4 h-44 animate-pulse rounded-3xl bg-surface-secondary" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-3xl bg-surface-secondary" />
        ))}
      </div>
    </div>
  )
}
