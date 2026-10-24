import { describe, it, expect } from 'vitest'
import {
  importRowsToTake,
  planAllowsWhatsApp,
  planAllowsMemberApp,
  isAppEligibleRank,
} from '@/lib/subscription-utils'

describe('importRowsToTake', () => {
  it('caps trial at 50', () => {
    expect(importRowsToTake('trial', 0, 60)).toBe(50)
    expect(importRowsToTake('trial', 0, 10)).toBe(10)
  })
  it('caps free by remaining room', () => {
    expect(importRowsToTake('free', 45, 20)).toBe(5)
    expect(importRowsToTake('free', 50, 20)).toBe(0)
  })
  it('does not cap paid plans', () => {
    expect(importRowsToTake('monthly', 100, 300)).toBe(300)
  })
})

describe('planAllowsWhatsApp', () => {
  const now = new Date('2026-10-24T00:00:00Z')
  it('is off for free without an add-on', () => {
    expect(planAllowsWhatsApp('free', null, now)).toBe(false)
  })
  it('is on for free with a future add-on', () => {
    expect(planAllowsWhatsApp('free', '2026-11-01T00:00:00Z', now)).toBe(true)
  })
  it('is off for free with a lapsed add-on', () => {
    expect(planAllowsWhatsApp('free', '2026-10-01T00:00:00Z', now)).toBe(false)
  })
  it('is on for trial and paid', () => {
    expect(planAllowsWhatsApp('trial', null, now)).toBe(true)
    expect(planAllowsWhatsApp('monthly', null, now)).toBe(true)
  })
})

describe('planAllowsMemberApp', () => {
  it('is off only for free', () => {
    expect(planAllowsMemberApp('free')).toBe(false)
    expect(planAllowsMemberApp('trial')).toBe(true)
    expect(planAllowsMemberApp('monthly')).toBe(true)
  })
})

describe('isAppEligibleRank', () => {
  it('limits trial to the first 50 members', () => {
    expect(isAppEligibleRank('trial', 49)).toBe(true)
    expect(isAppEligibleRank('trial', 50)).toBe(false)
  })
  it('does not limit paid plans', () => {
    expect(isAppEligibleRank('monthly', 500)).toBe(true)
  })
})
