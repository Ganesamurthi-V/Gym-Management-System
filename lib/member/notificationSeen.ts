/** Pure helpers for the bell's unread dot. The "seen" time lives in the member's browser only (no database). */
export const NOTIF_SEEN_KEY = 'gf-notif-seen'

/** Unread when there is a newest notification and it is newer than the last seen time (or nothing was seen yet). */
export function hasUnread(latestAt: string | null, seenAt: string | null): boolean {
  if (!latestAt) return false
  const latest = Date.parse(latestAt)
  if (Number.isNaN(latest)) return false
  if (!seenAt) return true
  const seen = Date.parse(seenAt)
  return Number.isNaN(seen) || latest > seen
}

export function readSeen(): string | null {
  try { return localStorage.getItem(NOTIF_SEEN_KEY) } catch { return null }
}

export function writeSeen(at: string): void {
  try { localStorage.setItem(NOTIF_SEEN_KEY, at) } catch { /* storage blocked: the dot just stays */ }
}
