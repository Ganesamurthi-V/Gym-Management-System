import { describe, it, expect } from 'vitest'
import { mergeNotifications, requestToNotification } from '@/lib/member/notificationsMerge'
import { hasUnread } from '@/lib/member/notificationSeen'
import type { GymNotice } from '@/types/notice'
import type { RenewalRequest } from '@/types/renewal'

const NOW = Date.parse('2026-10-28T10:00:00Z')
const notice = (id: string, createdAt: string): GymNotice =>
  ({ id, kind: 'info', title: 'T', body: 'B', expiresOn: null, isActive: true, createdAt })
const req = (o: Partial<RenewalRequest>): RenewalRequest => ({
  id: 'r1', kind: 'renewal', planName: 'Gold', status: 'approved', amount: 500, rejectReason: null,
  createdAt: '2026-10-20T00:00:00Z', reviewedAt: '2026-10-21T00:00:00Z', ...o,
} as RenewalRequest)

describe('mergeNotifications', () => {
  it('sorts newest first and ids are prefixed', () => {
    const out = mergeNotifications([notice('a', '2026-10-25T00:00:00Z')], [requestToNotification(req({}))], NOW)
    expect(out.map(n => n.id)).toEqual(['notice:a', 'request:r1'])
  })
  it('drops items older than 30 days', () => {
    expect(mergeNotifications([notice('old', '2026-09-01T00:00:00Z')], [], NOW)).toHaveLength(0)
  })
  it('caps at 30', () => {
    const many = Array.from({ length: 40 }, (_, i) => notice(String(i), '2026-10-27T00:00:00Z'))
    expect(mergeNotifications(many, [], NOW)).toHaveLength(30)
  })
  it('skips pending requests and words outcomes', () => {
    expect(requestToNotification(req({ status: 'pending' }))).toBeNull()
    expect(requestToNotification(req({ status: 'rejected', kind: 'due', rejectReason: 'Blurry' })))
      .toMatchObject({ title: 'Due payment not approved', body: 'Blurry', approved: false })
    expect(requestToNotification(req({ status: 'rejected', reviewedAt: null })))
      .toMatchObject({ title: 'Renewal not approved', at: '2026-10-20T00:00:00Z' })
  })
})

describe('hasUnread', () => {
  it('compares newest with last seen', () => {
    expect(hasUnread(null, null)).toBe(false)
    expect(hasUnread('2026-10-27T00:00:00Z', null)).toBe(true)
    expect(hasUnread('2026-10-27T00:00:00Z', '2026-10-27T00:00:00Z')).toBe(false)
    expect(hasUnread('2026-10-28T00:00:00Z', '2026-10-27T00:00:00Z')).toBe(true)
    expect(hasUnread('2026-10-28T00:00:00Z', 'garbage')).toBe(true)
  })
})
