import { createClient } from '@/lib/supabase/server'
import { MembersClient } from './MembersClient'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import type { MemberWithStatus } from '@/types'

async function getMembers(gymId: string): Promise<MemberWithStatus[]> {
  const supabase = await createClient()

  const { data: memberships } = await supabase
    .from('memberships')
    .select(`*, member:members(*)`)
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })

  const memberMap = new Map<string, MemberWithStatus>()

  if (memberships) {
    for (const m of memberships) {
      if (!m.member) continue
      if (!memberMap.has(m.member_id)) {
        const status = getMemberStatus(m.end_date)
        const daysRemaining = getDaysRemaining(m.end_date)
        memberMap.set(m.member_id, {
          ...m.member,
          latest_membership: m,
          status,
          days_remaining: daysRemaining,
        })
      }
    }
  }

  // Also get members with no memberships
  const { data: allMembers } = await supabase
    .from('members')
    .select('*')
    .eq('gym_id', gymId)
    .order('name')

  if (allMembers) {
    for (const m of allMembers) {
      if (!memberMap.has(m.id)) {
        memberMap.set(m.id, {
          ...m,
          latest_membership: null,
          status: 'expired',
          days_remaining: -999,
        })
      }
    }
  }

  return Array.from(memberMap.values()).sort((a, b) => {
    // Sort: expiring first, then active, then expired
    const order = { expiring: 0, active: 1, expired: 2 }
    return order[a.status] - order[b.status]
  })
}

export default async function MembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  const members = await getMembers(gym.id)

  return <MembersClient members={members} gymId={gym.id} />
}
