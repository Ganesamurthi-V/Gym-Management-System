import { createClient } from '@/lib/supabase/server'
import { AccountClient } from './AccountClient'

export const revalidate = 0

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name, created_at')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  // Fetch summary counts for display
  const [membersRes, membershipsRes, attendanceRes] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
    supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
  ])

  return (
    <AccountClient
      email={user.email ?? ''}
      gymId={gym.id}
      gymName={gym.name}
      gymCreatedAt={gym.created_at}
      memberCount={membersRes.count ?? 0}
      membershipCount={membershipsRes.count ?? 0}
      attendanceCount={attendanceRes.count ?? 0}
    />
  )
}
