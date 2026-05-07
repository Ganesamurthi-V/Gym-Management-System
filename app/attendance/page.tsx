import { createClient } from '@/lib/supabase/server'
import { AttendanceClient } from './AttendanceClient'
import { getMemberStatus } from '@/lib/utils'
import { format } from 'date-fns'

export default async function AttendancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  const today = format(new Date(), 'yyyy-MM-dd')

  // Fetch members with their latest membership (sorted in DB)
  const { data: members } = await supabase
    .from('members')
    .select(`
      id,
      name,
      phone,
      memberships(
        end_date,
        created_at
      )
    `)
    .eq('gym_id', gym.id)
    .order('name')

  // Fetch today's attendance
  const { data: todayAttendance } = await supabase
    .from('attendance')
    .select('member_id')
    .eq('gym_id', gym.id)
    .eq('date', today)

  const presentSet = new Set((todayAttendance ?? []).map(a => a.member_id))

  const activeMembers = (members ?? []).map(m => {
    // Sort memberships by created_at desc to get latest — done in JS since Supabase nested selects don't support order
    const sorted = (m.memberships as any[] ?? [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const latest = sorted[0]
    const status = latest ? getMemberStatus(latest.end_date) : 'expired'
    return { id: m.id, name: m.name, phone: m.phone, present: presentSet.has(m.id), status }
  }).filter(m => m.status !== 'expired')

  return (
    <AttendanceClient
      members={activeMembers}
      gymId={gym.id}
      today={today}
      totalPresent={presentSet.size}
    />
  )
}
