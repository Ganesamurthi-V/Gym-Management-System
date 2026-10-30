import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DUE_DRAFT_KEY, RENEW_DRAFT_KEY, clearPaymentDraft, loadDraft, markUpiOpened, saveDraft, upiOpenedRecently,
} from '@/app/m/membership/renew/paymentDraft'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('paymentDraft', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.stubGlobal('localStorage', memoryStorage())
  })

  it('remembers a draft and gives it back', () => {
    saveDraft(RENEW_DRAFT_KEY, { planKey: '2', categoryPick: 'cardio' })
    expect(loadDraft(RENEW_DRAFT_KEY)).toEqual({ planKey: '2', categoryPick: 'cardio' })
  })

  it('forgets a draft older than 45 minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
    saveDraft(DUE_DRAFT_KEY, { amountText: '500' })
    vi.setSystemTime(new Date('2026-10-28T10:44:00Z'))
    expect(loadDraft(DUE_DRAFT_KEY)).toEqual({ amountText: '500' })
    vi.setSystemTime(new Date('2026-10-28T10:46:00Z'))
    expect(loadDraft(DUE_DRAFT_KEY)).toBeNull()
  })

  it('knows the member recently went to a UPI app, until they finish or it goes stale', () => {
    expect(upiOpenedRecently()).toBe(false)
    markUpiOpened()
    expect(upiOpenedRecently()).toBe(true)
    clearPaymentDraft()
    expect(upiOpenedRecently()).toBe(false)
  })

  it('clearing removes every saved draft', () => {
    saveDraft(RENEW_DRAFT_KEY, { planKey: '1' })
    saveDraft(DUE_DRAFT_KEY, { amountText: '100' })
    clearPaymentDraft()
    expect(loadDraft(RENEW_DRAFT_KEY)).toBeNull()
    expect(loadDraft(DUE_DRAFT_KEY)).toBeNull()
  })

  it('does nothing, and does not throw, when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    })
    expect(() => saveDraft(RENEW_DRAFT_KEY, {})).not.toThrow()
    expect(loadDraft(RENEW_DRAFT_KEY)).toBeNull()
    expect(upiOpenedRecently()).toBe(false)
    expect(() => markUpiOpened()).not.toThrow()
    expect(() => clearPaymentDraft()).not.toThrow()
  })
})
