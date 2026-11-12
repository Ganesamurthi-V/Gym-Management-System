// Pure helpers for the owner Biometric page. No framework imports so they are unit tested.
import { FUTURE_TOLERANCE_MS } from '@/lib/devices/time'

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

/**
 * What the "Add member" screen needs to know: does the gym use a device, and can it be reached right now.
 * Uses deviceStatus so "connected" means the same thing here as on the Biometric page.
 */
export function deviceConnectionSummary(
  devices: { lastSeenAt: string | null; isActive: boolean }[],
  now: number = Date.now(),
): { hasDevice: boolean; connected: boolean } {
  const active = devices.filter(d => d.isActive)
  return {
    hasDevice: active.length > 0,
    connected: active.some(d => deviceStatus(d.lastSeenAt, now) === 'connected'),
  }
}

/**
 * Only an explicit `false` skips the device sync. Absent or unexpected values keep the old behaviour (sync), so
 * callers that never send the field are unaffected.
 */
export function wantsDeviceSync(value: unknown): boolean {
  return value !== false
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

export type CommandState = 'queued' | 'sent' | 'done' | 'failed'

export function commandStateChip(state: string): { label: string; tone: ChipTone } {
  switch (state) {
    case 'queued': return { label: 'Waiting for device', tone: 'slate' }
    case 'sent': return { label: 'Sent', tone: 'amber' }
    case 'done': return { label: 'Done', tone: 'emerald' }
    default: return { label: 'Failed, try again', tone: 'red' }
  }
}

/** "Add member 12" / "Remove member 12"; the PIN is the member number. */
export function commandLabel(kind: string, pin: string): string {
  const n = pinToMemberNumber(pin)
  const who = n !== null ? String(n) : pin
  return `${kind === 'remove_user' ? 'Remove' : 'Add'} member ${who}`
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

export type EnrolStatus = 'sending' | 'waiting' | 'enrolled' | 'failed'

/**
 * Progress of "Enrol a new member": newest add_user command for this device + pin since the dialog step began,
 * then the first punch after it. Pins match as numbers too, because the device may report "007" for "7".
 */
export function enrolStatus(a: {
  pin: string; deviceId: string
  commands: { deviceId: string; kind: string; pin: string; state: string; createdAt: string }[]
  punches: { pin: string; punchedAt: string }[]
  since: string
}): EnrolStatus {
  const since = Date.parse(a.since)
  const samePin = (p: string) => p === a.pin || (pinToMemberNumber(p) !== null && pinToMemberNumber(p) === pinToMemberNumber(a.pin))
  let newest: { state: string; t: number } | null = null
  for (const c of a.commands) {
    if (c.deviceId !== a.deviceId || c.kind !== 'add_user' || !samePin(c.pin)) continue
    const t = Date.parse(c.createdAt)
    if (Number.isNaN(t) || t < since) continue
    if (!newest || t > newest.t) newest = { state: c.state, t }
  }
  if (!newest) return 'sending'
  if (newest.state === 'failed') return 'failed'
  if (newest.state !== 'done') return 'sending'
  const punched = a.punches.some(p => samePin(p.pin) && Date.parse(p.punchedAt) > since)
  return punched ? 'enrolled' : 'waiting'
}

/** Device pins are numeric strings; "007" and "7" are the same member number. Returns null when not numeric. */
export function pinToMemberNumber(pin: string): number | null {
  if (!/^\d{1,9}$/.test(pin)) return null
  const n = parseInt(pin, 10)
  return n > 0 ? n : null
}

/**
 * Devices whose clock looks wrong: at least 2 recent punches the server ignored as "stale" because they were dated
 * past the same future tolerance the ingest uses. Old stale punches (a backlog) are not a clock problem, so they
 * do not count.
 */
export function clockSuspectDeviceIds(
  punches: { deviceId: string; punchedAt: string; createdAt: string; state: string }[],
  now: number = Date.now(),
): Set<string> {
  const counts = new Map<string, number>()
  for (const p of punches) {
    if (p.state !== 'stale') continue
    const punched = Date.parse(p.punchedAt)
    const created = Date.parse(p.createdAt)
    if (Number.isNaN(punched) || Number.isNaN(created)) continue
    if (punched <= created + FUTURE_TOLERANCE_MS) continue
    if (now - created > 24 * 60 * 60 * 1000) continue
    counts.set(p.deviceId, (counts.get(p.deviceId) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n >= 2).map(([id]) => id))
}

export type PunchFilterState = 'all' | 'applied' | 'unmapped' | 'duplicate' | 'stale' | 'blocked' | 'error'
const KNOWN_PUNCH_STATES = ['applied', 'unmapped', 'duplicate', 'stale', 'blocked']

/**
 * Search + filter for the "All punches" dialog. The query matches the member name or the device ID ("94" or
 * "Device ID 94"). 'error' also takes 'processing' and any unknown state, because punchStateChip shows those as Error.
 */
export function filterPunches<T extends { pin: string; state: string; memberName: string | null; deviceId: string }>(
  punches: T[],
  f: { query: string; state: PunchFilterState; deviceId: string },
): T[] {
  const q = f.query.trim().toLowerCase()
  return punches.filter(p => {
    if (f.deviceId !== 'all' && p.deviceId !== f.deviceId) return false
    if (f.state === 'error') { if (KNOWN_PUNCH_STATES.includes(p.state)) return false }
    else if (f.state !== 'all' && p.state !== f.state) return false
    if (!q) return true
    return (p.memberName ?? '').toLowerCase().includes(q)
      || p.pin.toLowerCase().includes(q)
      || `device id ${p.pin}`.toLowerCase().includes(q)
  })
}

export type CommandFilterState = 'all' | CommandState

/** Search + filter for the "All device commands" dialog. The query matches the command label or the status label. */
export function filterCommands<T extends { kind: string; pin: string; state: string }>(
  commands: T[],
  f: { query: string; state: CommandFilterState },
): T[] {
  const q = f.query.trim().toLowerCase()
  return commands.filter(c => {
    if (f.state !== 'all' && c.state !== f.state) return false
    if (!q) return true
    return commandLabel(c.kind, c.pin).toLowerCase().includes(q)
      || commandStateChip(c.state).label.toLowerCase().includes(q)
  })
}

export function formatPunchTimeIST(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
