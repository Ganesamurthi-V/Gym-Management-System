export default function Loading() {
  return (
    <div aria-busy="true">
      {/* Top bar: round back button + title */}
      <div className="flex h-14 items-center gap-3 px-4 xs:px-5 sm:px-6">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200" />
        <div className="h-5 w-36 animate-pulse rounded-full bg-slate-200" />
      </div>
      <div className="page-container pb-6 pt-2">
        <div className="space-y-3">
          {[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-3xl bg-slate-100" />)}
        </div>
      </div>
    </div>
  )
}
