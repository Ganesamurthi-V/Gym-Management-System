import { createClient } from '@/lib/supabase/server'
import { AttendanceClient } from './AttendanceClient'
import { format } from 'date-fns'

export const revalidate = 0

export default async function AttendancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  const today = format(new Date(), 'yyyy-MM-dd')

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
