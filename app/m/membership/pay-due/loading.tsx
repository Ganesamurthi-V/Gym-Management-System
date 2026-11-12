export default function PayDueLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading dues…</span>
      <div className="flex h-14 items-center gap-3 px-4 xs:px-5 sm:px-6">
        <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
        <div className="h-6 w-44 animate-pulse rounded-full bg-slate-200" />
      </div>
      <div className="page-container pt-2">
      <div className="h-6 w-40 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-3 h-24 animate-pulse rounded-3xl bg-slate-100" />
      </div>
    </div>
  )
}
