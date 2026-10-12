/**
 * Leaderboard skeleton. Mirrors the real layout (title, four tabs, podium,
 * rows) so nothing jumps when the board streams in. Shown only on a first load;
 * repeat visits come from the client Router Cache.
 */
export default function LeaderboardLoading() {
  return (
    <div className="page-container py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading leaderboard…</span>

      <div className="mb-5">
        <div className="h-7 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-56 animate-pulse rounded bg-slate-100" />
      </div>

      {/* Tabs */}
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-200" />
        ))}
      </div>

      {/* Motivating line */}
      <div className="mb-4 h-14 animate-pulse rounded-2xl bg-slate-100" />

      {/* Podium */}
      <div className="mb-4 grid grid-cols-3 items-end gap-2">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
