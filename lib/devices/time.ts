// Pure time helpers for biometric punches. No server-only import so tests can load it directly.

export type Session = 'morning' | 'evening'

export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
export const FUTURE_TOLERANCE_MS = 10 * 60 * 1000
export const DUPLICATE_WINDOW_MS = 60 * 1000

/** Same switch point as the kiosk's default (app/owner/attendance: hour >= 14 is evening). */
export const EVENING_STARTS_HOUR = 14

export const DEFAULT_DEVICE_TZ = 'Asia/Kolkata'

/** True when Intl knows the IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone }); return true } catch { return false }
}

const DEVICE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** Wall-clock fields of an instant in a zone, read back as if they were UTC (ms). */
function wallClockAsUtc(instantMs: number, timeZone: string): number {
  const p: Record<string, number> = {}
  for (const part of formatterFor(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
}

/**
 * Converts a device-local "YYYY-MM-DD HH:MM:SS" to a UTC instant using the device's IANA zone.
 * Returns null for malformed or impossible times or an unknown zone. Two passes handle zones whose
 * offset changes (DST) near the guess; India has none, but the device zone is configurable.
 */
export function deviceLocalToInstant(time: string, timeZone: string): Date | null {
  const m = DEVICE_TIME_RE.exec(time)
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s)
  const check = new Date(asUtc)
  // Rejects 2026-02-30 and 25:00:00, which Date.UTC would silently roll over.
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null
  try {
    let instant = asUtc - (wallClockAsUtc(asUtc, timeZone) - asUtc)
    instant = asUtc - (wallClockAsUtc(instant, timeZone) - instant)
    return new Date(instant)
  } catch {
    return null
  }
}

/** Calendar date (YYYY-MM-DD) of an instant in Asia/Kolkata, the date every attendance rule uses. */
export function istDateOf(instant: Date): string {
  return new Date(instant.getTime() + 330 * 60_000).toISOString().slice(0, 10)
}

export function sessionOf(instant: Date): Session {
  const istHour = new Date(instant.getTime() + 330 * 60_000).getUTCHours()
  return istHour >= EVENING_STARTS_HOUR ? 'evening' : 'morning'
}

/** A punch older than 7 days (a device clock reset, a long offline backlog) or in the future is not applied. */
export function isStale(instant: Date, now: Date): boolean {
  const t = instant.getTime()
  return t < now.getTime() - STALE_AFTER_MS || t > now.getTime() + FUTURE_TOLERANCE_MS
}
