import { createClient } from '@/lib/supabase/server'
import { requireOwnerAccess } from '@/lib/owner/access'
import { AttendanceClient } from './AttendanceClient'
import { todayIST } from '@/lib/utils'

export const revalidate = 0

export default async function AttendancePage() {
  const { gym } = await requireOwnerAccess()

  const today = todayIST()
  const supabase = await createClient()

  // Fetch today's attendance count only
  const { count } = await supabase
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gym.id)
    .eq('date', today)

  return (
    <AttendanceClient
      gymId={gym.id}
      gymName={gym.name}
      today={today}
      totalPresent={count ?? 0}
    />
  )
}
