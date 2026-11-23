// Pure helpers for the resource detail page. No SDK imports so they can be unit tested.
export const LOG_LIMIT = 30
const LOG_MESSAGE_MAX = 500

/** Exact-match allowlist check against the discovered inventory. */
export const inventoryHas = (ids: string[], id: string) => ids.includes(id)

/** S3 storage metrics are published once a day, so always read 30 days at a 1-day period. */
export function s3Window(now: number): { start: number; end: number; periodSec: number } {
  return { start: now - 30 * 86_400_000, end: now, periodSec: 86_400 }
}

export const trimLogMessage = (m: string) => {
  const t = m.trim()
  return t.length > LOG_MESSAGE_MAX ? t.slice(0, LOG_MESSAGE_MAX) : t
}

export function fmtBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtMs = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n).toLocaleString('en-US')} ms`)
