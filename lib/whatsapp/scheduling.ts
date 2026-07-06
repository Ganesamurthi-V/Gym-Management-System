/**
 * lib/whatsapp/scheduling.ts
 *
 * Pure scheduling logic for the WhatsApp automation engine.
 *
 * This module has NO side effects and NO IO — it only depends on date-fns.
 * All the "should we send this reminder today?" decisions live here so they
 * can be unit-tested exhaustively without a database or network.
 *
 * The reminder cadence for the three cyclic templates
 * (membership_expiry_reminder, membership_expired, payment_due_reminder) is:
 *   - one send every REMINDER_INTERVAL_DAYS days
 *   - at most MAX_REMINDER_SENDS times per cycle
 *   - a cancelled cycle never sends again
 */

import { differenceInDays, parseISO } from 'date-fns'

// ─── Cadence constants ──────────────────────────────────────────────────────

/** Max sends per reminder cycle (Day 0, 3, 6, 9, 12, 15, 18 = 7 sends) */
export const MAX_REMINDER_SENDS = 7
/** Interval between reminder sends in days */
export const REMINDER_INTERVAL_DAYS = 3
/** Total reminder window = (7 - 1) × 3 = 18 days */
export const REMINDER_WINDOW_DAYS = (MAX_REMINDER_SENDS - 1) * REMINDER_INTERVAL_DAYS // 18

// ─── Cycle state ────────────────────────────────────────────────────────────

/** The current state of a reminder cycle, derived from the automation logs. */
export interface CycleState {
  /** How many times this cycle has already sent (0 for a brand-new cycle). */
  sendCount: number
  /** ISO timestamp of the most recent send in this cycle, or null if none yet. */
  lastSentAt: string | null
  /** True if this cycle has been explicitly cancelled (member renewed / paid). */
  cancelled: boolean
}

export type SendReason = 'cancelled' | 'complete' | 'already_today' | 'interval'

export type SendDecision =
  | { send: true }
  | { send: false; reason: SendReason }

// ─── Decision function ──────────────────────────────────────────────────────

/**
 * Decide whether a cyclic reminder should be sent today.
 *
 * Order of checks matters — the first failing gate wins and is reported as the
 * reason (useful for metrics / debugging).
 *
 * @param state           - current cycle state from the logs
 * @param alreadySentToday - true if ANY send for this member+template happened today
 * @param today           - today's date as "YYYY-MM-DD"
 */
export function decideScheduledSend(
  state: CycleState,
  { alreadySentToday, today }: { alreadySentToday: boolean; today: string },
): SendDecision {
  if (state.cancelled) return { send: false, reason: 'cancelled' }
  if (state.sendCount >= MAX_REMINDER_SENDS) return { send: false, reason: 'complete' }
  if (alreadySentToday) return { send: false, reason: 'already_today' }

  // Enforce the N-day gap between sends within a cycle.
  if (state.sendCount > 0 && state.lastSentAt) {
    if (daysBetween(state.lastSentAt.slice(0, 10), today) < REMINDER_INTERVAL_DAYS) {
      return { send: false, reason: 'interval' }
    }
  }

  return { send: true }
}

// ─── Date helpers (date-only, timezone-stable) ──────────────────────────────

/**
 * Whole-day difference between two "YYYY-MM-DD" date strings (to − from).
 * Both are parsed at local midnight so the result is a clean integer,
 * independent of the time-of-day component or timezone offset.
 */
export function daysBetween(fromDate: string, toDate: string): number {
  return differenceInDays(parseISO(toDate), parseISO(fromDate))
}

/** Days until a membership end date (negative = already expired). */
export function daysUntil(endDate: string, today: string): number {
  return daysBetween(today, endDate.slice(0, 10))
}

/** Membership expires today or within the reminder window (not yet expired). */
export function isExpiringInWindow(endDate: string, today: string): boolean {
  const d = daysUntil(endDate, today)
  return d >= 0 && d <= REMINDER_WINDOW_DAYS
}

/** Membership expired within the reminder window (already past end date). */
export function isExpiredInWindow(endDate: string, today: string): boolean {
  const d = daysUntil(endDate, today)
  return d < 0 && Math.abs(d) <= REMINDER_WINDOW_DAYS
}

/** True if the member's birthday (month + day) falls on `today`. */
export function isBirthdayToday(dateOfBirth: string, today: string): boolean {
  const dob = dateOfBirth.slice(0, 10).split('-')
  const now = today.slice(0, 10).split('-')
  if (dob.length < 3 || now.length < 3) return false
  return dob[1] === now[1] && dob[2] === now[2]
}
