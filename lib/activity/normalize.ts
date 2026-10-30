// Pure rules for the owner activity log. The SQL function record_owner_activity normalises again
// defensively; keep the two in step.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const LONG_NUMBER_RE = /\d{4,}/g

export const MAX_ACTIVITY_PATH = 200
/** The same page is not logged twice inside this window (re-renders, quick back/forward). */
export const PAGE_VIEW_THROTTLE_MS = 10_000
/** Longer than this since the last activity counts as a new visit (app_open). */
export const NEW_VISIT_GAP_MS = 30 * 60 * 1000

/** Pathname without query/hash and repeated slashes, ids replaced by ':id', capped at 200 chars. */
export function normalizeRequestPath(raw: string): string {
  return raw
    .split('#')[0]
    .split('?')[0]
    .replace(/\/{2,}/g, '/')
    .replace(UUID_RE, ':id')
    .replace(LONG_NUMBER_RE, ':id')
    .slice(0, MAX_ACTIVITY_PATH)
}

/** Owner page path for page_view / app_open. Null when it is not an /owner/ page. */
export function normalizeActivityPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const path = normalizeRequestPath(raw)
  return path.startsWith('/owner/') ? path : null
}

export function shouldLogPageView(
  prev: { path: string; at: number } | null,
  next: string,
  now: number,
): boolean {
  if (!prev) return true
  return !(prev.path === next && now - prev.at < PAGE_VIEW_THROTTLE_MS)
}

export function isNewVisit(lastSeenMs: number | null | undefined, now: number): boolean {
  if (lastSeenMs == null || !Number.isFinite(lastSeenMs)) return true
  return now - lastSeenMs > NEW_VISIT_GAP_MS
}
