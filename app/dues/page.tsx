import { createClient } from '@/lib/supabase/server'
import { DuesClient } from './DuesClient'
import { getMemberStatus } from '@/lib/utils'

export default async function DuesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase.from('gyms').select('id, name').eq('owner_id', user.id).single()
  if (!gym) return null

  // Get all members with pending dues
  const { data: members } = await supabase
    .from('members')
    .select('id, name, phone, member_number, pending_amount, memberships(end_date, created_at)')
    .eq('gym_id', gym.id)
    .order('name')

  const dueMembers = (members ?? [])
    .map(m => {
      const sorted = (m.memberships as any[] ?? [])
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latest = sorted[0]
      const status = latest ? getMemberStatus(latest.end_date) : 'expired'
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        member_number: m.member_number,
        pending_amount: m.pending_amount ?? 0,
        status,
      }
    })
    .filter(m => m.pending_amount > 0)
    .sort((a, b) => b.pending_amount - a.pending_amount)

  const totalDues = dueMembers.reduce((s, m) => s + m.pending_amount, 0)

  return <DuesClient members={dueMembers} gymId={gym.id} totalDues={totalDues} />
}
