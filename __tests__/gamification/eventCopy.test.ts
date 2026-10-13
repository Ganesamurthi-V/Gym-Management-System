import { describe, expect, it } from 'vitest'
import {
  daysLeftText,
  eventStatus,
  formatDuration,
  formatEventDate,
  goalSentence,
  previewSentence,
  rewardSentence,
} from '@/lib/gamification/eventCopy'

const base = { goalTarget: 7, minSessionMinutes: null, sessionFilter: null } as const

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(45)).toBe('45 minutes')
    expect(formatDuration(60)).toBe('1 hour')
    expect(formatDuration(90)).toBe('1.5 hours')
    expect(formatDuration(120)).toBe('2 hours')
    expect(formatDuration(100)).toBe('1 hour 40 minutes')
  })
})

describe('goalSentence', () => {
  it('handles singular and plural', () => {
    expect(goalSentence({ ...base, goalType: 'checkin_days', goalTarget: 1 })).toBe('Check in on 1 day')
    expect(goalSentence({ ...base, goalType: 'checkin_days' })).toBe('Check in on 7 days')
    expect(goalSentence({ ...base, goalType: 'streak_days', goalTarget: 5 })).toBe('Keep a 5-day streak')
  })
  it('includes session length and filter', () => {
    expect(
      goalSentence({ goalType: 'long_sessions', goalTarget: 3, minSessionMinutes: 120, sessionFilter: null }),
    ).toBe('Stay 2 hours or more on 3 days')
    expect(
      goalSentence({ goalType: 'long_sessions', goalTarget: 3, minSessionMinutes: 90, sessionFilter: 'evening' }),
    ).toBe('Stay 1.5 hours or more on 3 days (evening only)')
    expect(goalSentence({ ...base, goalType: 'checkin_days', sessionFilter: 'morning' })).toBe(
      'Check in on 7 days (morning only)',
    )
  })
})

describe('rewardSentence', () => {
  it('describes xp, item, both and none', () => {
    expect(rewardSentence({ rewardXp: 200, rewardText: null })).toBe('200 XP')
    expect(rewardSentence({ rewardXp: 0, rewardText: 'Protein shaker' })).toBe('Protein shaker')
    expect(rewardSentence({ rewardXp: 200, rewardText: 'Protein shaker' })).toBe('200 XP and Protein shaker')
    expect(rewardSentence({ rewardXp: 0, rewardText: null })).toBe('')
  })
})

describe('eventStatus (IST dates, inclusive edges)', () => {
  const e = { startDate: '2026-10-20', endDate: '2026-11-05', isActive: true }
  it('covers the window edges', () => {
    expect(eventStatus(e, '2026-10-19')).toBe('upcoming')
    expect(eventStatus(e, '2026-10-20')).toBe('running')
    expect(eventStatus(e, '2026-11-05')).toBe('running')
    expect(eventStatus(e, '2026-11-06')).toBe('ended')
  })
  it('is paused unless already ended', () => {
    expect(eventStatus({ ...e, isActive: false }, '2026-10-25')).toBe('paused')
    expect(eventStatus({ ...e, isActive: false }, '2026-11-06')).toBe('ended')
  })
})

describe('dates and previews', () => {
  it('adds the year only when it differs', () => {
    expect(formatEventDate('2026-10-20', '2026-10-13')).toBe('20 Oct')
    expect(formatEventDate('2027-01-05', '2026-10-13')).toBe('5 Jan 2027')
  })
  it('builds the preview sentence', () => {
    expect(
      previewSentence(
        {
          ...base,
          goalType: 'checkin_days',
          startDate: '2026-10-20',
          endDate: '2026-11-05',
          rewardXp: 200,
          rewardText: 'Protein shaker',
        },
        '2026-10-13',
      ),
    ).toBe('Members who check in on 7 days between 20 Oct and 5 Nov get 200 XP and Protein shaker.')
  })
  it('days left', () => {
    const e = { startDate: '2026-10-20', endDate: '2026-11-05' }
    expect(daysLeftText(e, '2026-10-13')).toBe('Starts on 20 Oct')
    expect(daysLeftText(e, '2026-11-05')).toBe('Ends today')
    expect(daysLeftText(e, '2026-11-04')).toBe('1 day left')
    expect(daysLeftText(e, '2026-10-30')).toBe('6 days left')
  })
})
