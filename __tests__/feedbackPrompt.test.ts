/**
 * The schedule of the new-owner feedback pop-up: first 30 days of the gym, once onboarding is
 * done, at most every 3 days, and never again after feedback has been sent.
 */

import { describe, it, expect } from 'vitest'
import { shouldPromptForFeedback, FEEDBACK_PROMPT_INTERVAL_DAYS, FEEDBACK_PROMPT_WINDOW_DAYS } from '@/lib/feedback-prompt'

const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = new Date('2026-10-20T10:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const base = {
  now: NOW,
  gymCreatedAt: ago(2 * DAY),
  onboardingCompleted: true,
  hasFeedback: false,
  lastShownAt: null as string | null,
}

describe('shouldPromptForFeedback', () => {
  it('uses a 3 day interval and a 30 day window', () => {
    expect(FEEDBACK_PROMPT_INTERVAL_DAYS).toBe(3)
    expect(FEEDBACK_PROMPT_WINDOW_DAYS).toBe(30)
  })

  it('asks a new owner who has never been asked', () => {
    expect(shouldPromptForFeedback(base)).toEqual({ show: true, reason: 'show' })
  })

  it('does not ask again within 3 days', () => {
    expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(1 * DAY) }).reason).toBe('too_soon')
    expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(2 * DAY) }).reason).toBe('too_soon')
    expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(5 * 60_000) }).reason).toBe('too_soon')
  })

  it('asks again once 3 days have passed', () => {
    expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(3 * DAY) }).show).toBe(true)
    expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(4 * DAY) }).show).toBe(true)
  })

  it('counts a visit a few minutes before the same time of day as the third day', () => {
    // Shown at 10:00:05 three days ago, back at 10:00:00: still "every 3 days".
    expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(3 * DAY - 5_000) }).show).toBe(true)
    // But not a full hour early.
    expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(3 * DAY - 2 * HOUR) }).show).toBe(false)
  })

  it('stops for good once the owner has sent feedback', () => {
    expect(shouldPromptForFeedback({ ...base, hasFeedback: true }).reason).toBe('has_feedback')
    // even when it would otherwise be due
    expect(shouldPromptForFeedback({ ...base, hasFeedback: true, lastShownAt: ago(10 * DAY) }).show).toBe(false)
  })

  it('stops after the first 30 days', () => {
    expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(29 * DAY) }).show).toBe(true)
    expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(30 * DAY) }).reason).toBe('window_over')
    expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(90 * DAY) }).reason).toBe('window_over')
  })

  it('does not ask while onboarding is unfinished', () => {
    expect(shouldPromptForFeedback({ ...base, onboardingCompleted: false }).reason).toBe('not_onboarded')
  })

  it('asks nothing when the gym is unknown or its date is unreadable', () => {
    expect(shouldPromptForFeedback({ ...base, gymCreatedAt: null }).reason).toBe('unknown_gym')
    expect(shouldPromptForFeedback({ ...base, gymCreatedAt: 'not a date' }).reason).toBe('unknown_gym')
  })

  it('plays out as 3-day asks across a month, then stops', () => {
    const created = new Date('2026-10-01T09:00:00.000Z')
    let last: string | null = null
    const askedOn: number[] = []
    // The owner opens the app every day at 09:30.
    for (let day = 0; day < 40; day++) {
      const now = new Date(created.getTime() + day * DAY + 30 * 60_000)
      const r = shouldPromptForFeedback({ now, gymCreatedAt: created.toISOString(), onboardingCompleted: true, hasFeedback: false, lastShownAt: last })
      if (r.show) { askedOn.push(day); last = now.toISOString() }
    }
    expect(askedOn).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27])
  })

  it('stops the very day feedback is sent', () => {
    const created = new Date('2026-10-01T09:00:00.000Z')
    let last: string | null = null
    let hasFeedback = false
    const askedOn: number[] = []
    for (let day = 0; day < 20; day++) {
      const now = new Date(created.getTime() + day * DAY + 30 * 60_000)
      const r = shouldPromptForFeedback({ now, gymCreatedAt: created.toISOString(), onboardingCompleted: true, hasFeedback, lastShownAt: last })
      if (r.show) { askedOn.push(day); last = now.toISOString() }
      if (day === 7) hasFeedback = true // the owner sends feedback on day 7
    }
    expect(askedOn).toEqual([0, 3, 6])
  })
})
