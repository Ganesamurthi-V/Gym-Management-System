export default function ProgressLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading progress…</span>
      <div className="flex h-14 items-center gap-3 px-4 xs:px-5 sm:px-6">
        <div className="h-10 w-10 animate-pulse rounded-full bg-surface-secondary" />
        <div className="h-5 w-28 flex-1 animate-pulse rounded-full bg-surface-secondary" style={{ maxWidth: '7rem' }} />
        <div className="ml-auto h-10 w-10 animate-pulse rounded-full bg-surface-secondary" />
      </div>
      <div className="page-container pt-4">
        <div className="mb-2 h-12 w-48 animate-pulse rounded-2xl bg-surface-secondary" />
        <div className="mb-4 h-4 w-36 animate-pulse rounded-full bg-surface-secondary" />
        <div className="mb-4 h-52 animate-pulse rounded-3xl bg-surface-secondary" />
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 w-[140px] shrink-0 animate-pulse rounded-3xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    </div>
  )
}
