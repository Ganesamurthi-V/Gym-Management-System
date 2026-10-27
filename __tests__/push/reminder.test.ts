import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REMINDER_COOLDOWN_MS,
  bumpVisit,
  markDismissed,
  readReminderMeta,
  shouldShowPushReminder,
} from '@/lib/push/reminder'

const now = 1_800_000_000_000

describe('shouldShowPushReminder', () => {
  it('never when on or unsupported', () => {
    for (const state of ['on', 'unsupported'] as const) {
      expect(shouldShowPushReminder({ state, visits: 10, lastDismissedAt: null, now })).toBeNull()
    }
  })

  it('waits for 3 visits', () => {
    expect(shouldShowPushReminder({ state: 'off', visits: 2, lastDismissedAt: null, now })).toBeNull()
    expect(shouldShowPushReminder({ state: 'off', visits: 3, lastDismissedAt: null, now })).toBe('enable')
  })

  it('honours the 7 day cooldown after a dismissal', () => {
    const base = { state: 'off' as const, visits: 5, now }
    expect(shouldShowPushReminder({ ...base, lastDismissedAt: now - REMINDER_COOLDOWN_MS + 1 })).toBeNull()
    expect(shouldShowPushReminder({ ...base, lastDismissedAt: now - REMINDER_COOLDOWN_MS })).toBe('enable')
  })

  it('returns instruction variants for denied and iOS', () => {
    expect(shouldShowPushReminder({ state: 'denied', visits: 3, lastDismissedAt: null, now })).toBe('denied-help')
    expect(shouldShowPushReminder({ state: 'ios-needs-install', visits: 3, lastDismissedAt: null, now })).toBe('ios-install')
  })
})

describe('storage helpers', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubStorage(store: Record<string, string>) {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
    })
  }

  it('counts visits and records dismissal', () => {
    const store: Record<string, string> = {}
    stubStorage(store)
    expect(readReminderMeta()).toEqual({ visits: 0, lastDismissedAt: null })
    bumpVisit(); bumpVisit()
    markDismissed(123)
    expect(readReminderMeta()).toEqual({ visits: 2, lastDismissedAt: 123 })
  })

  it('ignores garbage values', () => {
    stubStorage({ 'gf-push-visits': 'abc', 'gf-push-dismissed': '-5' })
    expect(readReminderMeta()).toEqual({ visits: 0, lastDismissedAt: null })
  })

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    expect(readReminderMeta()).toEqual({ visits: 0, lastDismissedAt: null })
    expect(() => bumpVisit()).not.toThrow()
    expect(() => markDismissed()).not.toThrow()
  })
})
