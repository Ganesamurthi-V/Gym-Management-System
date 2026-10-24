/**
 * The schedule of the owner feedback pop-up: nothing in the first 3 days, then once a day until
 * the owner has sent feedback for the first time, then once a month, with no end date.
 */

import { describe, it, expect } from 'vitest'
import {
  shouldPromptForFeedback,
  FEEDBACK_PROMPT_FIRST_DELAY_DAYS,
  FEEDBACK_PROMPT_DAILY_INTERVAL_DAYS,
  FEEDBACK_PROMPT_MONTHLY_INTERVAL_DAYS,
} from '@/lib/feedback-prompt'

const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = new Date('2026-10-20T10:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const base = {
  now: NOW,
  gymCreatedAt: ago(5 * DAY),
  onboardingCompleted: true,
  lastFeedbackAt: null as string | null,
  lastShownAt: null as string | null,
}

describe('shouldPromptForFeedback', () => {
  it('waits 3 days, then asks daily, then monthly', () => {
    expect(FEEDBACK_PROMPT_FIRST_DELAY_DAYS).toBe(3)
    expect(FEEDBACK_PROMPT_DAILY_INTERVAL_DAYS).toBe(1)
    expect(FEEDBACK_PROMPT_MONTHLY_INTERVAL_DAYS).toBe(30)
  })

  describe('the first 3 days', () => {
    it('does not ask a brand new gym, so the owner can explore first', () => {
      expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(10_000) }).reason).toBe('too_early')
      expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(1 * DAY) }).reason).toBe('too_early')
      expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(3 * DAY - HOUR) }).reason).toBe('too_early')
    })

    it('can ask from day 3', () => {
      expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(3 * DAY) })).toEqual({ show: true, reason: 'show', kind: 'first' })
    })
  })

  describe('until the first feedback: at most once a day', () => {
    it('asks a person who has never been asked', () => {
      expect(shouldPromptForFeedback(base)).toEqual({ show: true, reason: 'show', kind: 'first' })
    })

    it('does not ask twice in a day', () => {
      expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(5 * 60_000) }).reason).toBe('too_soon')
      expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(12 * HOUR) }).reason).toBe('too_soon')
    })

    it('asks again the next day', () => {
      expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(1 * DAY) }).show).toBe(true)
      expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(2 * DAY) }).show).toBe(true)
    })

    it('counts a visit a few minutes before the same time of day as the next day', () => {
      expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(1 * DAY - 5_000) }).show).toBe(true)
      expect(shouldPromptForFeedback({ ...base, lastShownAt: ago(1 * DAY - 2 * HOUR) }).show).toBe(false)
    })

    it('keeps asking daily with no end date (a gym a year old that never replied)', () => {
      expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(365 * DAY), lastShownAt: ago(1 * DAY) })).toEqual({ show: true, reason: 'show', kind: 'first' })
    })
  })

  describe('after the first feedback: once a month', () => {
    const sent = (daysAgo: number) => ({ ...base, lastFeedbackAt: ago(daysAgo * DAY) })

    it('uses the monthly wording', () => {
      expect(shouldPromptForFeedback(sent(40)).kind).toBe('monthly')
    })

    it('does not ask again within the month', () => {
      expect(shouldPromptForFeedback(sent(1)).reason).toBe('too_soon')
      expect(shouldPromptForFeedback(sent(10)).reason).toBe('too_soon')
      expect(shouldPromptForFeedback(sent(29)).reason).toBe('too_soon')
    })

    it('asks again after 30 days', () => {
      expect(shouldPromptForFeedback(sent(30))).toEqual({ show: true, reason: 'show', kind: 'monthly' })
      expect(shouldPromptForFeedback(sent(45)).show).toBe(true)
    })

    it('counts the wait from the later of the last ask and the last feedback', () => {
      // Feedback 40 days ago, but the monthly pop-up was shown (and closed) 10 days ago.
      expect(shouldPromptForFeedback({ ...base, lastFeedbackAt: ago(40 * DAY), lastShownAt: ago(10 * DAY) }).reason).toBe('too_soon')
      // Pop-up shown 40 days ago, feedback sent 5 days ago: the month runs from the feedback.
      expect(shouldPromptForFeedback({ ...base, lastFeedbackAt: ago(5 * DAY), lastShownAt: ago(40 * DAY) }).reason).toBe('too_soon')
    })

    it('still honours the first 3 days (feedback sent from Support on day 1 does not trigger a pop-up on day 2)', () => {
      expect(shouldPromptForFeedback({ ...base, gymCreatedAt: ago(2 * DAY), lastFeedbackAt: ago(31 * DAY) }).reason).toBe('too_early')
    })
  })

  it('does not ask while onboarding is unfinished', () => {
    expect(shouldPromptForFeedback({ ...base, onboardingCompleted: false }).reason).toBe('not_onboarded')
  })

  it('asks nothing when the gym is unknown or its date is unreadable', () => {
    expect(shouldPromptForFeedback({ ...base, gymCreatedAt: null }).reason).toBe('unknown_gym')
    expect(shouldPromptForFeedback({ ...base, gymCreatedAt: 'not a date' }).reason).toBe('unknown_gym')
  })

  it('plays out as: nothing for 3 days, daily asks, then monthly after feedback', () => {
    const created = new Date('2026-10-01T09:00:00.000Z')
    let lastShown: string | null = null
    let lastFeedback: string | null = null
    const asks: Array<{ day: number; kind: string }> = []
    // The owner opens the app every day at 09:30 and sends feedback on day 6 (right after the ask).
    for (let day = 0; day < 75; day++) {
      const now = new Date(created.getTime() + day * DAY + 30 * 60_000)
      const r = shouldPromptForFeedback({ now, gymCreatedAt: created.toISOString(), onboardingCompleted: true, lastFeedbackAt: lastFeedback, lastShownAt: lastShown })
      if (r.show) {
        asks.push({ day, kind: r.kind })
        lastShown = now.toISOString()
        if (day === 6) lastFeedback = new Date(now.getTime() + 60_000).toISOString()
      }
    }
    expect(asks).toEqual([
      { day: 3, kind: 'first' },
      { day: 4, kind: 'first' },
      { day: 5, kind: 'first' },
      { day: 6, kind: 'first' },
      { day: 36, kind: 'monthly' },
      { day: 66, kind: 'monthly' },
    ])
  })
})
