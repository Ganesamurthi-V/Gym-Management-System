import { WARNING_FAILS, REMINDER_MS, LAST_RUN_REFRESH_MS } from './config'
import type { ProbeResult } from './probe'

export interface ProbeState {
  fails: number
  alerted: boolean
  lastAlert: number
  reason: string
  since: number
}

export interface State {
  lastRun: number
  /** Time of the last canary login, so it runs at most every 15 minutes. */
  canaryLast?: number
  probes: Record<string, ProbeState>
}

export interface AlertMessage {
  level: 'CRITICAL' | 'WARNING' | 'RECOVERED'
  name: string
  reason: string
  reminder: boolean
  kind?: ProbeResult['kind']
  status?: number
  /** When the probe first failed (ms). */
  since?: number
}

export const emptyState = (): State => ({ lastRun: 0, probes: {} })

/** Pure alert decision. Probes absent from `results` (e.g. canary not due) keep their state untouched. */
export function decide(
  prev: State,
  results: ProbeResult[],
  now: number,
): { next: State; messages: AlertMessage[]; changed: boolean } {
  const next: State = { ...prev, probes: { ...prev.probes } }
  const messages: AlertMessage[] = []
  let changed = false

  for (const r of results) {
    const cur = prev.probes[r.name]
    if (r.ok) {
      if (cur) {
        delete next.probes[r.name]
        changed = true
        if (cur.alerted) messages.push({ level: 'RECOVERED', name: r.name, reason: cur.reason, reminder: false, since: cur.since })
      }
      continue
    }

    const threshold = r.critical ? 1 : WARNING_FAILS
    const level = r.critical ? 'CRITICAL' : 'WARNING'
    // fails is capped at the threshold so a long outage causes no KV writes between reminders.
    const fails = Math.min((cur?.fails ?? 0) + 1, threshold)
    const st: ProbeState = cur
      ? { ...cur, reason: r.reason }
      : { fails: 0, alerted: false, lastAlert: 0, reason: r.reason, since: now }

    if (!st.alerted && fails >= threshold) {
      st.alerted = true
      st.lastAlert = now
      messages.push({ level, name: r.name, reason: r.reason, reminder: false, kind: r.kind, status: r.status, since: st.since })
      changed = true
    } else if (st.alerted && now - st.lastAlert >= REMINDER_MS) {
      st.lastAlert = now
      messages.push({ level, name: r.name, reason: r.reason, reminder: true, kind: r.kind, status: r.status, since: st.since })
      changed = true
    }
    if (fails !== (cur?.fails ?? 0)) changed = true
    st.fails = fails
    next.probes[r.name] = st
  }

  if (changed || now - prev.lastRun >= LAST_RUN_REFRESH_MS) {
    next.lastRun = now
    changed = true
  }
  return { next, messages, changed }
}

/** Undo the "alerted" bookkeeping for messages Telegram did not accept, so the next run retries them. */
export function revertUnsent(prev: State, next: State, failed: AlertMessage[]): void {
  for (const m of failed) {
    const before = prev.probes[m.name]
    const cur = next.probes[m.name]
    if (m.level === 'RECOVERED') {
      if (before) next.probes[m.name] = before
    } else if (cur) {
      next.probes[m.name] = m.reminder && before
        ? { ...cur, lastAlert: before.lastAlert }
        : { ...cur, alerted: false, lastAlert: 0 }
    }
  }
}

/** True when probe states or the canary stamp differ (ignores lastRun, which is refreshed hourly). */
export function probesDiffer(prev: State, next: State): boolean {
  return JSON.stringify(prev.probes) !== JSON.stringify(next.probes) || prev.canaryLast !== next.canaryLast
}
