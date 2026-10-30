import type { PushDeviceState } from '@/types/push'

export const REMINDER_MIN_VISITS = 3
export const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

export type ReminderVariant = 'enable' | 'denied-help' | 'ios-install'

/**
 * When to nudge a member to turn notifications on. Never before the third app visit, then at
 * most once a week after a dismissal. Denied / iOS-not-installed get instructions, not a button.
 */
export function shouldShowPushReminder(input: {
  state: PushDeviceState
  visits: number
  lastDismissedAt: number | null
  now: number
}): ReminderVariant | null {
  const { state, visits, lastDismissedAt, now } = input
  if (state === 'on' || state === 'unsupported') return null
  if (visits < REMINDER_MIN_VISITS) return null
  if (lastDismissedAt !== null && now - lastDismissedAt < REMINDER_COOLDOWN_MS) return null
  if (state === 'denied') return 'denied-help'
  if (state === 'ios-needs-install') return 'ios-install'
  return 'enable'
}

const VISITS_KEY = 'gf-push-visits'
const DISMISSED_KEY = 'gf-push-dismissed'

export function readReminderMeta(): { visits: number; lastDismissedAt: number | null } {
  let visits = 0
  let lastDismissedAt: number | null = null
  try {
    const v = Number(localStorage.getItem(VISITS_KEY))
    if (Number.isFinite(v) && v > 0) visits = Math.floor(v)
    const d = Number(localStorage.getItem(DISMISSED_KEY))
    if (Number.isFinite(d) && d > 0) lastDismissedAt = d
  } catch { /* storage blocked: treat as a first visit, so the banner stays hidden */ }
  return { visits, lastDismissedAt }
}

export function bumpVisit(): void {
  try {
    localStorage.setItem(VISITS_KEY, String(readReminderMeta().visits + 1))
  } catch { /* ignore */ }
}

export function markDismissed(now: number = Date.now()): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(now))
  } catch { /* ignore */ }
}
