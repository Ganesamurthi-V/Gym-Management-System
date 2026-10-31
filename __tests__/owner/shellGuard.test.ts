import { describe, it, expect } from 'vitest'
import { decideShellGuard, type ShellData } from '@/lib/owner/shellGuard'
import { computeSubscriptionState } from '@/lib/subscription-utils'

const gym: NonNullable<ShellData['gym']> = {
  id: 'g1', name: 'Gym', onboarding_completed: true, owner_id: 'u1',
  created_at: '2026-01-01T00:00:00Z', onboarding_data: null,
}

type State = Pick<ShellData, 'gym' | 'isExpired' | 'isActive'>
const healthy: State = { gym, isExpired: false, isActive: true }

const DASH = '/owner/dashboard'
const PAYWALL = '/owner/subscription'
const ONBOARD = '/owner/onboarding'

describe('decideShellGuard', () => {
  it('passes a healthy gym everywhere in the console', () => {
    for (const p of [DASH, PAYWALL, ONBOARD]) {
      // a completed gym on the onboarding page is the page's own business, not the guard's
      expect(decideShellGuard(healthy, p)).toBe('ok')
    }
  })

  it('never decides for non-owner paths, whatever the state', () => {
    const worst: State = { gym: null, isExpired: true, isActive: false }
    expect(decideShellGuard(worst, '/auth/login')).toBe('ok')
    expect(decideShellGuard(worst, '/m/home')).toBe('ok')
  })

  describe('no gym', () => {
    const s: State = { gym: null, isExpired: false, isActive: true }
    it.each([DASH, PAYWALL, ONBOARD])('%s -> add-phone', p => {
      expect(decideShellGuard(s, p)).toBe('/auth/add-phone')
    })
  })

  describe('deactivated', () => {
    const s: State = { gym, isExpired: true, isActive: false }
    it.each([DASH, PAYWALL, ONBOARD])('%s -> blocked sign-out route (wins over expiry)', p => {
      expect(decideShellGuard(s, p)).toBe('/auth/blocked')
    })
  })

  describe('expired', () => {
    const s: State = { gym, isExpired: true, isActive: true }
    it('sends the dashboard and the onboarding page to the paywall', () => {
      expect(decideShellGuard(s, DASH)).toBe(PAYWALL)
      expect(decideShellGuard(s, ONBOARD)).toBe(PAYWALL)
    })
    it('lets the paywall page itself render', () => {
      expect(decideShellGuard(s, PAYWALL)).toBe('ok')
    })
  })

  describe('onboarding incomplete', () => {
    it.each([false, null])('onboarding_completed=%s -> onboarding, except on onboarding and paywall', done => {
      const s: State = { gym: { ...gym, onboarding_completed: done }, isExpired: false, isActive: true }
      expect(decideShellGuard(s, DASH)).toBe(ONBOARD)
      expect(decideShellGuard(s, '/owner/members/new')).toBe(ONBOARD)
      expect(decideShellGuard(s, ONBOARD)).toBe('ok')
      expect(decideShellGuard(s, PAYWALL)).toBe('ok')
    })
    it('a brand-new trial owner is sent to onboarding, never the paywall', () => {
      const future = new Date(Date.now() + 14 * 86400_000).toISOString()
      const sub = computeSubscriptionState({ subscription_status: 'trial', trial_ends_at: future } as any)
      const s: State = { gym: { ...gym, onboarding_completed: false }, isExpired: sub.isExpired, isActive: true }
      expect(decideShellGuard(s, DASH)).toBe(ONBOARD)
    })
    it('expired and unfinished -> paywall first', () => {
      const s: State = { gym: { ...gym, onboarding_completed: false }, isExpired: true, isActive: true }
      expect(decideShellGuard(s, DASH)).toBe(PAYWALL)
      expect(decideShellGuard(s, PAYWALL)).toBe('ok')
    })
  })

  it('maps real subscription states: running trial ok, lapsed trial paywalled', () => {
    const future = new Date(Date.now() + 5 * 86400_000).toISOString()
    const past = new Date(Date.now() - 86400_000).toISOString()
    const live = computeSubscriptionState({ subscription_status: 'trial', trial_ends_at: future } as any)
    const lapsed = computeSubscriptionState({ subscription_status: 'trial', trial_ends_at: past } as any)
    expect(decideShellGuard({ ...healthy, isExpired: live.isExpired }, DASH)).toBe('ok')
    expect(decideShellGuard({ ...healthy, isExpired: lapsed.isExpired }, DASH)).toBe(PAYWALL)
  })
})
