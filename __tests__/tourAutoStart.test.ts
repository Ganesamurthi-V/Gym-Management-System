/**
 * When the owner tour may start without being asked for: only for a brand-new owner on their
 * first dashboard visit after setup. After that it is only ever started by the owner, from the
 * account menu.
 */

import { describe, it, expect } from 'vitest'
import {
  EMPTY_TOUR_PROGRESS,
  FIRST_RUN_WINDOW_MS,
  shouldAutoStartTour,
  type TourProgress,
} from '@/lib/tours/progress'

const NOW = new Date('2026-10-20T10:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const HOUR = 3_600_000
const DAY = 24 * HOUR

const progress = (over: Partial<TourProgress>): TourProgress => ({ ...EMPTY_TOUR_PROGRESS, ...over })

describe('shouldAutoStartTour', () => {
  it('starts for a brand-new gym that has never seen the tour', () => {
    expect(shouldAutoStartTour(progress({}), ago(10 * 60_000), NOW)).toBe(true)
    expect(shouldAutoStartTour(progress({}), ago(5 * HOUR), NOW)).toBe(true)
  })

  it('stops being a first run after a day', () => {
    expect(shouldAutoStartTour(progress({}), ago(FIRST_RUN_WINDOW_MS - 1_000), NOW)).toBe(true)
    expect(shouldAutoStartTour(progress({}), ago(FIRST_RUN_WINDOW_MS), NOW)).toBe(false)
    expect(shouldAutoStartTour(progress({}), ago(3 * DAY), NOW)).toBe(false)
  })

  it('does not start for an existing owner who set up long ago and never took the tour', () => {
    expect(shouldAutoStartTour(progress({}), ago(90 * DAY), NOW)).toBe(false)
  })

  it('never starts again once it was finished or closed on purpose', () => {
    expect(shouldAutoStartTour(progress({ status: 'completed' }), ago(HOUR), NOW)).toBe(false)
    expect(shouldAutoStartTour(progress({ status: 'dismissed' }), ago(HOUR), NOW)).toBe(false)
  })

  it('does not resume a tour that was left halfway, even within the first day', () => {
    const half = progress({ status: 'in_progress', chapterId: 'payments', stepIndex: 1 })
    expect(shouldAutoStartTour(half, ago(HOUR), NOW)).toBe(false)
    expect(shouldAutoStartTour(half, ago(5 * DAY), NOW)).toBe(false)
  })

  it('does not start when the gym is unknown, its date is unreadable, or the date is in the future', () => {
    expect(shouldAutoStartTour(progress({}), null, NOW)).toBe(false)
    expect(shouldAutoStartTour(progress({}), undefined, NOW)).toBe(false)
    expect(shouldAutoStartTour(progress({}), 'not a date', NOW)).toBe(false)
    expect(shouldAutoStartTour(progress({}), new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBe(false)
  })
})
