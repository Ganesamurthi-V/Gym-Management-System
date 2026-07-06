/**
 * Unit tests for the pure scheduling logic (lib/whatsapp/scheduling.ts).
 *
 * These cover the cadence rules that decide whether a cyclic reminder should be
 * sent today — the 3-day gap, the 7-send cap, cancellation, and same-day dedup —
 * plus the membership-window and birthday helpers.
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_REMINDER_SENDS,
  REMINDER_INTERVAL_DAYS,
  REMINDER_WINDOW_DAYS,
  decideScheduledSend,
  daysBetween,
  daysUntil,
  isExpiringInWindow,
  isExpiredInWindow,
  isBirthdayToday,
  type CycleState,
} from '@/lib/whatsapp/scheduling'

const fresh: CycleState = { sendCount: 0, lastSentAt: null, cancelled: false }

describe('constants', () => {
  it('defines the documented cadence', () => {
    expect(MAX_REMINDER_SENDS).toBe(7)
    expect(REMINDER_INTERVAL_DAYS).toBe(3)
    expect(REMINDER_WINDOW_DAYS).toBe(18)
  })
})

describe('decideScheduledSend', () => {
  it('sends the first message of a brand-new cycle', () => {
    expect(decideScheduledSend(fresh, { alreadySentToday: false, today: '2026-07-06' }))
      .toEqual({ send: true })
  })

  it('never sends a cancelled cycle', () => {
    const state: CycleState = { sendCount: 2, lastSentAt: '2026-06-01T03:30:00.000Z', cancelled: true }
    expect(decideScheduledSend(state, { alreadySentToday: false, today: '2026-07-06' }))
      .toEqual({ send: false, reason: 'cancelled' })
  })

  it('stops once the send cap is reached', () => {
    const state: CycleState = { sendCount: MAX_REMINDER_SENDS, lastSentAt: '2026-07-01T03:30:00.000Z', cancelled: false }
    expect(decideScheduledSend(state, { alreadySentToday: false, today: '2026-07-06' }))
      .toEqual({ send: false, reason: 'complete' })
  })

  it('does not send twice on the same day', () => {
    const state: CycleState = { sendCount: 1, lastSentAt: '2026-07-06T03:30:00.000Z', cancelled: false }
    expect(decideScheduledSend(state, { alreadySentToday: true, today: '2026-07-06' }))
      .toEqual({ send: false, reason: 'already_today' })
  })

  it('enforces the 3-day gap between sends', () => {
    const state: CycleState = { sendCount: 1, lastSentAt: '2026-07-04T03:30:00.000Z', cancelled: false }
    // Only 2 days later → too soon
    expect(decideScheduledSend(state, { alreadySentToday: false, today: '2026-07-06' }))
      .toEqual({ send: false, reason: 'interval' })
  })

  it('sends again exactly on the 3rd day', () => {
    const state: CycleState = { sendCount: 1, lastSentAt: '2026-07-03T03:30:00.000Z', cancelled: false }
    expect(decideScheduledSend(state, { alreadySentToday: false, today: '2026-07-06' }))
      .toEqual({ send: true })
  })

  it('simulates a full 7-send cycle at the correct dates', () => {
    // Day 0, 3, 6, 9, 12, 15, 18 → 7 sends, then stop.
    const sendDays = [0, 3, 6, 9, 12, 15, 18]
    let sendCount = 0
    let lastSentAt: string | null = null
    const anchor = new Date('2026-07-01T00:00:00.000Z')

    const sentOn: number[] = []
    for (let day = 0; day <= 30; day++) {
      const date = new Date(anchor.getTime() + day * 86400000)
      const today = date.toISOString().slice(0, 10)
      const decision = decideScheduledSend(
        { sendCount, lastSentAt, cancelled: false },
        { alreadySentToday: false, today },
      )
      if (decision.send) {
        sentOn.push(day)
        sendCount++
        lastSentAt = `${today}T03:30:00.000Z`
      }
    }

    expect(sentOn).toEqual(sendDays)
    expect(sendCount).toBe(MAX_REMINDER_SENDS)
  })
})

describe('date helpers', () => {
  it('daysBetween counts whole days regardless of time component', () => {
    expect(daysBetween('2026-07-01', '2026-07-04')).toBe(3)
    expect(daysBetween('2026-07-04', '2026-07-01')).toBe(-3)
    expect(daysBetween('2026-07-01', '2026-07-01')).toBe(0)
  })

  it('daysUntil is positive before expiry, negative after, tolerates timestamps', () => {
    expect(daysUntil('2026-07-10', '2026-07-06')).toBe(4)
    expect(daysUntil('2026-07-01', '2026-07-06')).toBe(-5)
    expect(daysUntil('2026-07-10T00:00:00.000Z', '2026-07-06')).toBe(4)
  })
})

describe('membership window helpers', () => {
  it('flags a membership expiring within the window', () => {
    expect(isExpiringInWindow('2026-07-06', '2026-07-06')).toBe(true)   // today
    expect(isExpiringInWindow('2026-07-24', '2026-07-06')).toBe(true)   // +18 (edge)
    expect(isExpiringInWindow('2026-07-25', '2026-07-06')).toBe(false)  // +19 (outside)
    expect(isExpiringInWindow('2026-07-05', '2026-07-06')).toBe(false)  // already expired
  })

  it('flags a membership expired within the window', () => {
    expect(isExpiredInWindow('2026-07-05', '2026-07-06')).toBe(true)    // -1
    expect(isExpiredInWindow('2026-06-18', '2026-07-06')).toBe(true)    // -18 (edge)
    expect(isExpiredInWindow('2026-06-17', '2026-07-06')).toBe(false)   // -19 (outside)
    expect(isExpiredInWindow('2026-07-06', '2026-07-06')).toBe(false)   // expires today, not expired
  })

  it('expiring and expired are mutually exclusive', () => {
    for (let offset = -25; offset <= 25; offset++) {
      const end = new Date(Date.UTC(2026, 6, 6) + offset * 86400000).toISOString().slice(0, 10)
      const a = isExpiringInWindow(end, '2026-07-06')
      const b = isExpiredInWindow(end, '2026-07-06')
      expect(a && b).toBe(false)
    }
  })
})

describe('isBirthdayToday', () => {
  it('matches on month + day, ignoring year', () => {
    expect(isBirthdayToday('1990-07-06', '2026-07-06')).toBe(true)
    expect(isBirthdayToday('2001-07-06', '2026-07-06')).toBe(true)
  })

  it('does not match a different day', () => {
    expect(isBirthdayToday('1990-07-05', '2026-07-06')).toBe(false)
    expect(isBirthdayToday('1990-08-06', '2026-07-06')).toBe(false)
  })

  it('handles timestamp-form dates', () => {
    expect(isBirthdayToday('1990-07-06T00:00:00.000Z', '2026-07-06')).toBe(true)
  })
})
