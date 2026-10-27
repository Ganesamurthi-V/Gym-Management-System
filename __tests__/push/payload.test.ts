import { describe, it, expect } from 'vitest'
import { buildPushPayload, sanitizePushUrl, PUSH_COPY } from '@/lib/push/payload'
import { PUSH_LIMITS } from '@/types/push'

describe('buildPushPayload', () => {
  it('uses the gym name as title and defaults the tag to the kind', () => {
    const p = buildPushPayload('notice', { gymName: 'Iron Gym', body: 'Closed Sunday', url: '/m/notifications' })
    expect(p).toEqual({ title: 'Iron Gym', body: 'Closed Sunday', url: '/m/notifications', tag: 'notice' })
  })
  it('trims title and body with an ellipsis', () => {
    const p = buildPushPayload('notice', { gymName: 'G'.repeat(100), body: 'b'.repeat(300), url: '/m/home', tag: 't' })
    expect(p.title.length).toBe(PUSH_LIMITS.titleMax)
    expect(p.body.length).toBe(PUSH_LIMITS.bodyMax)
    expect(p.body.endsWith('…')).toBe(true)
    expect(p.tag).toBe('t')
  })
  it('does not add an ellipsis to text at the limit', () => {
    expect(buildPushPayload('notice', { gymName: 'G', body: 'x'.repeat(PUSH_LIMITS.bodyMax), url: '/m/home' }).body).not.toContain('…')
  })
})

describe('sanitizePushUrl', () => {
  it('keeps /m/ paths', () => expect(sanitizePushUrl('/m/progress/body?x=1')).toBe('/m/progress/body?x=1'))
  for (const u of ['https://evil.com/m/home', '//evil.com/m/x', '/owner/members', '/m', 'm/home', '/m/..\\evil', '/m/a\nb', ''])
    it(`replaces ${JSON.stringify(u)}`, () => expect(sanitizePushUrl(u)).toBe('/m/home'))
})

describe('PUSH_COPY', () => {
  const emoji = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/u
  const all: string[] = [
    PUSH_COPY.renewalApproved, PUSH_COPY.renewalRejected, PUSH_COPY.dueApproved, PUSH_COPY.dueRejected,
    PUSH_COPY.expiring(1), PUSH_COPY.expiring(3), PUSH_COPY.weighIn, PUSH_COPY.measurements,
    PUSH_COPY.goalDateNear, PUSH_COPY.goalReached,
    ...[0, 1, 2].map(i => PUSH_COPY.missYou(i)), ...[0, 1].map(i => PUSH_COPY.streakRisk(i)),
  ]
  it('has no emojis, money or weights, and fits the body limit', () => {
    for (const s of all) {
      expect(s).not.toMatch(emoji)
      expect(s).not.toMatch(/₹|\brs\b|\bkg\b/i)
      expect(s.length).toBeLessThanOrEqual(PUSH_LIMITS.bodyMax)
    }
  })
  it('rotates the variants', () => {
    expect(new Set([0, 1, 2].map(i => PUSH_COPY.missYou(i))).size).toBe(3)
    expect(new Set([0, 1].map(i => PUSH_COPY.streakRisk(i))).size).toBe(2)
  })
  it('passes the notice title and quote through', () => {
    expect(PUSH_COPY.notice('Holiday')).toBe('Holiday')
    expect(PUSH_COPY.weeklyQuote('Keep going')).toBe('Keep going')
  })
})
