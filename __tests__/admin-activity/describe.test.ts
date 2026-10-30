import { describe, it, expect } from 'vitest'
import { describeActivity, KNOWN_ACTION_LABELS } from '../../gymflow-admin/lib/activity/describe'
import { activityQuerySchema } from '../../gymflow-admin/lib/activity/query'

describe('describeActivity', () => {
  it('app_open', () => expect(describeActivity({ kind: 'app_open' })).toBe('Opened the app'))
  it('maps every known action label', () => {
    for (const label of KNOWN_ACTION_LABELS) {
      const t = describeActivity({ kind: 'action', label })
      expect(t).not.toBe('')
      expect(t).not.toMatch(/_/)
    }
    expect(describeActivity({ kind: 'action', label: 'MEMBERS_CREATE' })).toBe('Added a member')
    expect(describeActivity({ kind: 'action', label: 'NOTICES_CREATE' })).toBe('Posted a gym notice')
    expect(describeActivity({ kind: 'action', label: 'MEMBERS_UPDATE' })).toBe('Edited a member')
    expect(describeActivity({ kind: 'action', label: 'MEMBERS_DELETE' })).toBe('Deleted a member')
    expect(describeActivity({ kind: 'action', label: 'PAYMENTS_COLLECT' })).toBe('Collected a payment')
    expect(describeActivity({ kind: 'action', label: 'PROGRAMS_ASSIGN' })).toBe('Assigned a program to members')
    expect(describeActivity({ kind: 'action', label: 'ONBOARDING_COMPLETE' })).toBe('Finished gym setup')
  })
  it('unknown action falls back to sentence case', () => {
    expect(describeActivity({ kind: 'action', label: 'SOME_THING' })).toBe('Some thing')
    expect(describeActivity({ kind: 'action', label: null })).toBe('Performed an action')
  })
  it('page paths', () => {
    const v = (path: string) => describeActivity({ kind: 'page_view', path })
    expect(v('/owner/members')).toBe('Viewed Members')
    expect(v('/owner/members/:id')).toBe('Viewed a member')
    expect(v('/owner/payments')).toBe('Viewed Payments')
    expect(v('/owner/dashboard')).toBe('Viewed Dashboard')
    expect(v('/owner/import')).toBe('Viewed Import')
    expect(v('/owner/some-new-page')).toBe('Viewed Some new page')
  })
})

describe('activityQuerySchema', () => {
  it('defaults', () => expect(activityQuerySchema.parse({})).toEqual({ limit: 50, kind: 'all' }))
  it('rejects bad input', () => {
    expect(activityQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(activityQuerySchema.safeParse({ limit: 101 }).success).toBe(false)
    expect(activityQuerySchema.safeParse({ kind: 'x' }).success).toBe(false)
    expect(activityQuerySchema.safeParse({ before: 'nope' }).success).toBe(false)
  })
})
