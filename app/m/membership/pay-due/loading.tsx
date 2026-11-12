export default function PayDueLoading() {
  return (
    <div className="page-container py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading dues…</span>
      <div className="mb-5">
        <div className="h-7 w-40 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="h-6 w-40 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-3 h-24 animate-pulse rounded-3xl bg-slate-100" />
    </div>
  )
}
