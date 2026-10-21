import { describe, it, expect } from 'vitest'
import { selectInviteTargets } from '@/lib/whatsapp/inviteAll'

const m = (id: string, phone: string | null, status: string | null) =>
  ({ id, name: id, phone, invitation_status: status })

describe('selectInviteTargets', () => {
  it('excludes activated members and members without a phone', () => {
    const res = selectInviteTargets([
      m('a', '9876543210', 'activated'),
      m('b', null, 'not_sent'),
      m('c', '   ', 'pending'),
      m('d', '9876543211', 'not_sent'),
      m('e', '9876543212', 'pending'),
      m('f', '9876543213', 'expired'),
      m('g', '9876543214', null),
    ])
    expect(res.targets.map(t => t.id)).toEqual(['d', 'e', 'f', 'g'])
    expect(res.alreadyActivated).toBe(1)
    expect(res.skippedNoPhone).toBe(2)
  })

  it('counts an activated member without a phone as activated, not as no-phone', () => {
    const res = selectInviteTargets([m('a', null, 'activated')])
    expect(res).toEqual({ targets: [], skippedNoPhone: 0, alreadyActivated: 1 })
  })
})
