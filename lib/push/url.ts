const FALLBACK = '/m/home'
const DOT_SEGMENT = /(^|\/)\.\.?(\/|$|\?|#)/

/**
 * Notification click target. The payload comes from our server, but the worker still refuses
 * anything that is not a plain same-origin member path, so a bad payload can never navigate away.
 * Pure and import-free: it is bundled into the service worker.
 */
export function safePushUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 300) return FALLBACK
  // Control characters and backslashes (browsers treat them as "/") are never legitimate.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    if (c <= 0x1f || c === 0x7f || c === 0x5c) return FALLBACK
  }
  if (!/^\/m(\/|$|\?|#)/.test(raw)) return FALLBACK
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return FALLBACK
  }
  if (decoded.includes('\\') || decoded.startsWith('//') || DOT_SEGMENT.test(raw) || DOT_SEGMENT.test(decoded)) {
    return FALLBACK
  }
  return raw
}
