// Pure helpers for the owner Biometric page. No framework imports so they are unit tested.

export type DeviceStatus = 'connected' | 'waiting' | 'offline'

/** A device that pinged within this window counts as connected (ADMS devices poll every ~30-60 s). */
export const CONNECTED_WINDOW_MS = 5 * 60 * 1000

export const SERIAL_RE = /^[A-Za-z0-9_-]{1,64}$/

export function normalizeSerial(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidSerial(raw: string): boolean {
  return SERIAL_RE.test(normalizeSerial(raw))
}

/** null last_seen_at means the device has never contacted the server. */
export function deviceStatus(lastSeenAt: string | null, now: number = Date.now()): DeviceStatus {
  if (!lastSeenAt) return 'waiting'
  const t = Date.parse(lastSeenAt)
  if (Number.isNaN(t)) return 'waiting'
  return now - t <= CONNECTED_WINDOW_MS ? 'connected' : 'offline'
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function formatLastSeen(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'never'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'never'
  const sec = Math.max(0, Math.floor((now - t) / 1000))
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} h ago`
  const days = Math.floor(hr / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

export function statusLabel(status: DeviceStatus, lastSeenAt: string | null, now: number = Date.now()): string {
  if (status === 'connected') return `Connected - last seen ${formatLastSeen(lastSeenAt, now)}`
  if (status === 'offline') return `Offline since ${formatLastSeen(lastSeenAt, now)}`
  return 'Waiting for device'
}

export type PunchState = 'applied' | 'unmapped' | 'duplicate' | 'stale' | 'blocked' | 'error'
export type ChipTone = 'emerald' | 'amber' | 'slate' | 'red'

export function punchStateChip(state: string): { label: string; tone: ChipTone } {
  switch (state) {
    case 'applied': return { label: 'Counted', tone: 'emerald' }
    case 'unmapped': return { label: 'Needs matching', tone: 'amber' }
    case 'duplicate': return { label: 'Ignored', tone: 'slate' }
    case 'stale': return { label: 'Too old', tone: 'slate' }
    case 'blocked': return { label: 'Blocked', tone: 'red' }
    case 'processing': return { label: 'Processing', tone: 'slate' }
    default: return { label: 'Error', tone: 'red' }
  }
}

export type UnmappedPin = { pin: string; count: number; lastPunchedAt: string }

/** Groups unmapped punches into one row per (device, pin), newest punch first. */
export function groupUnmapped(
  punches: { device_id: string; pin: string; punched_at: string }[],
): Map<string, UnmappedPin[]> {
  const byDevice = new Map<string, Map<string, UnmappedPin>>()
  for (const p of punches) {
    let pins = byDevice.get(p.device_id)
    if (!pins) { pins = new Map(); byDevice.set(p.device_id, pins) }
    const cur = pins.get(p.pin)
    if (!cur) pins.set(p.pin, { pin: p.pin, count: 1, lastPunchedAt: p.punched_at })
    else {
      cur.count += 1
      if (Date.parse(p.punched_at) > Date.parse(cur.lastPunchedAt)) cur.lastPunchedAt = p.punched_at
    }
  }
  const out = new Map<string, UnmappedPin[]>()
  for (const [dev, pins] of byDevice) {
    out.set(dev, [...pins.values()].sort((a, b) => Date.parse(b.lastPunchedAt) - Date.parse(a.lastPunchedAt)))
  }
  return out
}

/** Device pins are numeric strings; "007" and "7" are the same member number. Returns null when not numeric. */
export function pinToMemberNumber(pin: string): number | null {
  if (!/^\d{1,9}$/.test(pin)) return null
  const n = parseInt(pin, 10)
  return n > 0 ? n : null
}

export function formatPunchTimeIST(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
