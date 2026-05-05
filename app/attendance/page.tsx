import { createClient } from '@/lib/supabase/server'
import { AttendanceClient } from './AttendanceClient'
import { getMemberStatus } from '@/lib/utils'
import { format } from 'date-fns'
// import { BottomNav } from '@/components/layout/BottomNav'

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

  // Get all active/expiring members
  const { data: memberships } = await supabase
    .from('memberships')
    .select(`*, member:members(*)`)
    .eq('gym_id', gym.id)
    .gte('end_date', today)
    .order('created_at', { ascending: false })

  // Get today's attendance
  const { data: todayAttendance } = await supabase
    .from('attendance')
    .select('member_id')
    .eq('gym_id', gym.id)
    .eq('date', today)

  const presentSet = new Set((todayAttendance ?? []).map(a => a.member_id))

  // Build unique active member list
  const memberMap = new Map<string, any>()
  for (const m of memberships ?? []) {
    if (!m.member || memberMap.has(m.member_id)) continue
    const status = getMemberStatus(m.end_date)
    if (status !== 'expired') {
      memberMap.set(m.member_id, {
        id: m.member.id,
        name: m.member.name,
        phone: m.member.phone,
        present: presentSet.has(m.member_id),
      })
    }
  }

  const members = Array.from(memberMap.values()).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-lg mx-auto pb-24">
        <AttendanceClient members={members} gymId={gym.id} today={today} totalPresent={presentSet.size} />
      </main>
      {/* <BottomNav /> */}
    </div>
  )
}
