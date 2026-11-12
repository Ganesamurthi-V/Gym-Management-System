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
 *
 * Shaped like the shared frame: top bar row, headline, week strip, wide card, tile.
 */
export default function MemberLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Top bar: round avatar + title */}
      <div className="flex h-14 items-center gap-3 px-4 xs:px-5 sm:px-6">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200" />
        <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200" />
        <div className="ml-auto h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-100" />
      </div>

      <div className="page-container pb-6 pt-2">
        {/* Headline */}
        <div className="mb-4">
          <div className="h-3 w-32 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-2 h-8 w-64 max-w-full animate-pulse rounded-full bg-slate-200" />
        </div>

        {/* Week strip: 7 chips */}
        <div className="mb-6 grid grid-cols-7 gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>

        {/* Wide card */}
        <div className="mb-6 h-44 w-[85%] animate-pulse rounded-3xl bg-slate-100" />

        {/* Tile */}
        <div className="h-28 animate-pulse rounded-3xl bg-slate-100" />
      </div>
    </div>
  )
}
