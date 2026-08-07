/**
 * Instant loading shell for every member route.
 *
 * Because this sits inside the `(member)` group, the layout (and therefore the
 * BottomNav) renders immediately and stays interactive while the page's data
 * streams in. Without this file the browser sat on the previous page for the
 * full server render, which is what made navigation feel like a 2-4s freeze.
 *
 * Repeat visits to an already-seen tab are served from the client Router Cache
 * (see `experimental.staleTimes` in next.config.mjs), so this skeleton is only
 * shown on a genuine first load — never on a cached tab switch.
 */
export default function MemberLoading() {
  return (
    <div className="page-container py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Header */}
      <div className="mb-5">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-7 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-100" />
      </div>

      {/* Primary card */}
      <div className="mb-5 h-24 animate-pulse rounded-2xl bg-slate-100" />

      {/* Stat grid */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>

      {/* List rows */}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
