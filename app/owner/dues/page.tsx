import { createClient } from '@/lib/supabase/server'
import { requireOwnerAccess } from '@/lib/owner/access'
import { DuesClient } from './DuesClient'
import { getMemberStatus } from '@/lib/utils'

export default async function DuesPage() {
  const { gym } = await requireOwnerAccess()

  const supabase = await createClient()

  // Filter pending_amount > 0 in DB, only fetch needed columns
  const { data: members } = await supabase
    .from('members')
    .select('id, name, phone, member_number, pending_amount, memberships!fk_memberships_member_same_gym(end_date)')
    .eq('gym_id', gym.id)
    .gt('pending_amount', 0)
    .order('pending_amount', { ascending: false })
    .limit(500)

  const dueMembers = (members ?? [])
    .map(m => {
      const memberships = m.memberships as { end_date: string }[] ?? []
      const latestEndDate = memberships.reduce(
        (max, ms) => ms.end_date > max ? ms.end_date : max,
        ''
      )
      const status = latestEndDate ? getMemberStatus(latestEndDate) : 'expired'
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        member_number: m.member_number,
        pending_amount: m.pending_amount ?? 0,
        status,
      }
    })

  const totalDues = dueMembers.reduce((s, m) => s + m.pending_amount, 0)

  return <DuesClient members={dueMembers} gymId={gym.id} totalDues={totalDues} />
}
