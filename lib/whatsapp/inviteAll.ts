/**
 * Pure selection of who a bulk "invite all to the member app" should message.
 * Kept framework-free so the rules are unit tested.
 */

export interface InviteCandidate {
  id: string
  name: string
  phone: string | null
  invitation_status: string | null
}

export interface InviteSelection<T extends InviteCandidate> {
  targets: T[]
  skippedNoPhone: number
  alreadyActivated: number
}

/**
 * Activated members are never re-invited (a new token would reset their activation).
 * 'not_sent', 'pending', 'delivered' and 'expired' are all eligible: the first three have
 * not finished activating, and an expired invite needs a fresh one.
 */
export function selectInviteTargets<T extends InviteCandidate>(members: T[]): InviteSelection<T> {
  const targets: T[] = []
  let skippedNoPhone = 0
  let alreadyActivated = 0
  for (const m of members) {
    if (m.invitation_status === 'activated') { alreadyActivated++; continue }
    if (!m.phone || !m.phone.trim()) { skippedNoPhone++; continue }
    targets.push(m)
  }
  return { targets, skippedNoPhone, alreadyActivated }
}
