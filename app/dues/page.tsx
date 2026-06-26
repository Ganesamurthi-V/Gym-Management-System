import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { DuesClient } from './DuesClient'
import { getMemberStatus } from '@/lib/utils'

export default async function DuesPage() {
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  const supabase = await createClient()

  // Filter pending_amount > 0 in DB, only fetch needed columns
  const { data: members } = await supabase
    .from('members')
    .select('id, name, phone, member_number, pending_amount, memberships(end_date)')
    .eq('gym_id', gym.id)
    .gt('pending_amount', 0)
    .order('pending_amount', { ascending: false })

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
